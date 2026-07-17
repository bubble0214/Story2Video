from __future__ import annotations

import json
import re
from uuid import UUID

from app.providers.llm import LLMFactory
from app.providers.prompt.novel import build_chapter_messages
from app.repositories.draft import DraftRepository
from app.services.volume_review import (
    CLOSING_ARC_NOTES,
    DECISION_PROMPT,
    DECISION_SYSTEM_PROMPT,
    FINAL_REVIEW_PROMPT,
    REVIEW_SYSTEM_PROMPT,
    V2_OUTLINE_PROMPT_TEMPLATE,
    V2_OUTLINE_SYSTEM_PROMPT,
    parse_decision,
    parse_review_chapter_revisions,
)
from app.utils.llm_key import resolve_user_llm_key

SCHEMA_VERSION = 1


class DraftService:
    """Service layer for draft management."""

    def __init__(self, repo: DraftRepository) -> None:
        self._repo = repo

    async def create(self, user_id: UUID, title: str = "未命名", workflow_type: str = "novel", draft_group_id: UUID | None = None):
        return await self._repo.create(user_id=user_id, title=title, workflow_type=workflow_type, draft_group_id=draft_group_id)

    async def upsert(
        self,
        user_id: UUID,
        title: str = "未命名",
        workflow_type: str = "novel",
        current_step: str = "prompt",
        step_data: dict | None = None,
    ) -> Draft:
        """Find existing in_progress draft for this user+type, or create a new one.

        This ensures each user has at most one in_progress draft per workflow type.
        """
        existing = await self._repo.find_in_progress(
            user_id=user_id,
            workflow_type=workflow_type,
        )
        if existing is not None:
            updated = await self._repo.update(
                draft_id=existing.id,
                title=title,
                current_step=current_step,
                step_data=step_data or {"schema_version": 1},
            )
            return updated or existing
        return await self._repo.create(
            user_id=user_id,
            title=title,
            workflow_type=workflow_type,
        )

    async def get(self, draft_id: UUID):
        return await self._repo.get_by_id(draft_id)

    async def list_user_drafts(
        self,
        user_id: UUID,
        workflow_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ):
        return await self._repo.list_by_user(
            user_id=user_id,
            workflow_type=workflow_type,
            limit=limit,
            offset=offset,
        )

    async def update(
        self,
        draft_id: UUID,
        title: str | None = None,
        status: str | None = None,
        current_step: str | None = None,
        step_data: dict | None = None,
    ):
        return await self._repo.update(
            draft_id=draft_id,
            title=title,
            status=status,
            current_step=current_step,
            step_data=step_data,
        )

    async def delete(self, draft_id: UUID) -> bool:
        return await self._repo.delete(draft_id)

    async def generate_next_chapter(
        self,
        draft_id: UUID,
        user_id: UUID,
        gen_model: str | None = None,
        chapter_num: int | None = None,
        decision: str | None = None,
    ) -> dict:
        """Generate the next chapter for a novel draft interactively.

        State machine:
        - chapters < totalChapters → generate a normal chapter
        - chapters == totalChapters and volumeReviewState is None → _run_volume_review()
        - volumeReviewState in ("executing_v2", "executing_closing") → _generate_next_volume_chapter()
        - volumeReviewState == "completed" → ValueError (all done)

        When chapter_num is provided, it overrides the auto-calculated next chapter number
        (used for regeneration of a specific chapter).
        When decision is provided, it is passed through to handle volume-review
        decisions from a separate endpoint.
        """
        draft = await self._repo.get_by_id(draft_id)
        if draft is None:
            raise ValueError("Draft not found")
        if str(draft.user_id) != str(user_id):
            raise ValueError("Draft does not belong to this user")
        if draft.workflow_type != "novel":
            raise ValueError("Chapter generation is only available for novel drafts")

        sd = draft.step_data or {}
        chapters = sd.get("chapters", [])
        volume_outline = sd.get("volumeOutlineText", "")
        custom_prompt = sd.get("customPrompt", "")
        references = sd.get("references", [])
        character_rules = sd.get("characterRulesText", "")

        total_chapters = sd.get("totalChapters", 30)
        next_chapter_num = chapter_num if chapter_num is not None else (len(chapters) + 1)
        volume_review_state = sd.get("volumeReviewState")

        # ── State machine ──
        if next_chapter_num <= total_chapters:
            # Normal chapter generation
            return await self._generate_single_chapter(
                draft, sd, chapters, next_chapter_num,
                total_chapters, volume_outline, custom_prompt,
                references, character_rules, user_id, gen_model,
            )

        # All numbered chapters done — check volume review state
        if volume_review_state is None or volume_review_state == "pending_review":
            return await self._run_volume_review(
                draft, sd, chapters, total_chapters,
                custom_prompt, volume_outline, references,
                character_rules, user_id, gen_model,
            )

        if volume_review_state in ("executing_v2", "executing_closing"):
            return await self._generate_next_volume_chapter(
                draft, sd, chapters, total_chapters,
                custom_prompt, volume_outline, references,
                character_rules, user_id, gen_model,
            )

        # Final review is pending — return stored data so the frontend can show it
        if volume_review_state == "pending_final_review":
            final_report = sd.get("finalReviewReport", "")
            applied_revisions = sd.get("finalReviewRevisions", [])
            return {
                "chapter_num": len(chapters),
                "chapter_title": chapters[-1].get("title", "") if chapters else "",
                "chapter_content": chapters[-1].get("content", "") if chapters else "",
                "total_chapters": total_chapters,
                "draft": draft,
                "quality_check_needed": False,
                "final_review": {
                    "report": final_report,
                    "chapter_count": len(chapters),
                    "total_chapters": total_chapters,
                    "revised_chapters": applied_revisions if applied_revisions else None,
                },
            }

        raise ValueError("All chapters have been generated")

    async def _resolve_provider(self, user_id: UUID, gen_model: str | None):
        """Resolve LLM provider from user's API keys."""
        input_params = {}
        if gen_model:
            input_params["model"] = gen_model
            if "::" not in gen_model:
                input_params["model"] = gen_model

        llm_key, llm_provider, base_url, model = await resolve_user_llm_key(
            user_id, input_params
        )
        if llm_provider == "custom":
            llm_provider = "openai"
        return LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    async def _generate_single_chapter(
        self, draft, sd, chapters, chapter_num, total_chapters,
        volume_outline, custom_prompt, references, character_rules,
        user_id, gen_model,
    ) -> dict:
        """Generate a single normal chapter (1-30 or v2/closing continuation)."""
        provider = await self._resolve_provider(user_id, gen_model)

        volume_label = "第二卷" if chapter_num > 10 else "第一卷"
        prev_summary = ""
        if chapter_num > 10 and chapters:
            prev_summary = chapters[-1].get("content", "")[:300]

        messages = build_chapter_messages(
            custom_prompt=custom_prompt,
            references=references,
            volume_outline=volume_outline,
            character_rules=character_rules,
            chapter_num=chapter_num,
            volume_label=volume_label,
            prev_chapter_summary=prev_summary,
        )

        chapter_text = (await provider.chat(messages)).strip()

        chapter_title = f"第{chapter_num}章"
        # Try markdown heading first, then plain "第X章" or "第X章 标题" format
        heading_match = re.search(r"^#+\s+(.+)$", chapter_text, re.MULTILINE)
        if heading_match:
            chapter_title = heading_match.group(1).strip()
        else:
            plain_match = re.search(r"^第\d+章\s*(.+)$", chapter_text, re.MULTILINE)
            if plain_match and plain_match.group(1).strip():
                chapter_title = f"第{chapter_num}章 {plain_match.group(1).strip()}"

        # ── Per-chapter quality check: 3 criteria, max 2 passes ──
        if character_rules.strip():
            qc_prompt = (
                f"你是一名严格的小说质检编辑。请检查这一章是否满足以下三项要求：\n\n"
                f"要求1：剧情推进——该章必须有具体的剧情事件发生，不能停留于描述状态或心理活动\n"
                f"要求2：结尾钩子——最后一段必须有强力悬念、反转或扣人心弦的结尾\n"
                f"要求3：人设一致——主角言行必须符合以下人物行为守则：\n"
                f"{character_rules}\n\n"
                f"【正文】\n{chapter_text}\n\n"
                "请逐项分析，然后输出一个JSON对象（不要markdown代码块标记）：\n"
                '{"pass": true/false, "reason": "如不通过，简述不合格原因和对应的要求编号"}'
            )
            qc_messages = [
                {"role": "system", "content": "你是一名严格的小说质检编辑。"},
                {"role": "user", "content": qc_prompt},
            ]
            try:
                qc_raw = (await provider.chat(qc_messages)).strip()
                qc_raw = re.sub(r"^```(?:json)?\s*", "", qc_raw)
                qc_raw = re.sub(r"\s*```$", "", qc_raw)
                qc_result = json.loads(qc_raw)
                if not qc_result.get("pass", True):
                    rewrite_prompt = (
                        f"【质检报告】\n{chapter_text}\n\n"
                        f"【修改要求】\n{qc_result.get('reason', '')}\n\n"
                        "请修改上述章节，只修改有问题的部分。保留其他内容不变。\n"
                        "输出完整的修改后正文。"
                    )
                    rewrite_messages = [
                        {"role": "system", "content": "你是一名资深小说作家。请根据质检要求修改本章，只改有问题的部分。输出完整的修改后正文。"},
                        {"role": "user", "content": rewrite_prompt},
                    ]
                    chapter_text = (await provider.chat(rewrite_messages)).strip()
                    heading_match = re.search(r"^#+\s+(.+)$", chapter_text, re.MULTILINE)
                    if heading_match:
                        chapter_title = heading_match.group(1).strip()
                    else:
                        plain_match = re.search(r"^第\d+章\s*(.+)$", chapter_text, re.MULTILINE)
                        if plain_match and plain_match.group(1).strip():
                            chapter_title = f"第{chapter_num}章 {plain_match.group(1).strip()}"
            except json.JSONDecodeError:
                logger.warning("Quality check JSON parse failed, skipping auto-rewrite")

        new_chapter = {"title": chapter_title, "content": chapter_text}
        # Always append new chapter (regeneration is no longer supported)
        updated_chapters = chapters + [new_chapter]

        novel_content = "\n\n---\n\n".join(
            f"# {ch['title']}\n\n{ch['content']}" for ch in updated_chapters
        )

        quality_check_needed = chapter_num % 10 == 0
        updated_sd = {
            **sd,
            "chapters": updated_chapters,
            "totalChapters": total_chapters,
            "generateMode": "interactive",
            "novelContent": novel_content,
        }
        if quality_check_needed:
            updated_sd["qualityReport"] = sd.get("qualityReport")

        updated_draft = await self._repo.update(
            draft_id=draft.id,
            current_step="generate",
            step_data=updated_sd,
        )

        return {
            "chapter_num": chapter_num,
            "chapter_title": chapter_title,
            "chapter_content": chapter_text,
            "total_chapters": total_chapters,
            "draft": updated_draft,
            "quality_check_needed": quality_check_needed,
        }

    async def _run_volume_review(
        self, draft, sd, chapters, total_chapters,
        custom_prompt, volume_outline, references,
        character_rules, user_id, gen_model,
    ) -> dict:
        """Phase 1: Run final review + decision prompt on all 30 chapters.

        Saves the review report + decision to step_data and returns a
        GenerateChapterResp with volume_review set so the frontend can
        display the report and let the user choose.
        """
        provider = await self._resolve_provider(user_id, gen_model)

        accumulated = "\n\n".join(
            f"第{i+1}章：{ch['title']}\n\n{ch['content']}"
            for i, ch in enumerate(chapters)
        )

        # Step A: Final review
        review_messages = [
            {"role": "system", "content": REVIEW_SYSTEM_PROMPT},
            {"role": "user", "content": f"已完成全部30章：\n\n{accumulated}\n\n{FINAL_REVIEW_PROMPT}"},
        ]
        final_report = (await provider.chat(review_messages)).strip()

        # Parse chapter revisions from review (do NOT auto-apply)
        revisions = parse_review_chapter_revisions(final_report)
        applied_revisions = []
        for ch_idx, revised_text in revisions.items():
            if 0 <= ch_idx < len(chapters):
                old_title = chapters[ch_idx].get("title", f"第{ch_idx+1}章")
                applied_revisions.append({
                    "chapter_index": ch_idx,
                    "title": old_title,
                    "content": revised_text,
                })

        # Step B: Story state analysis & decision (using original chapters)
        novel_so_far = "\n\n".join(
            f"第{i+1}章：{ch['title']}\n\n{ch['content']}"
            for i, ch in enumerate(chapters)
        )
        decision_messages = [
            {"role": "system", "content": DECISION_SYSTEM_PROMPT},
            {"role": "user", "content": f"已完成的第一卷正文：\n\n{novel_so_far}\n\n{DECISION_PROMPT}"},
        ]
        decision_text = (await provider.chat(decision_messages)).strip()
        parsed_decision = parse_decision(decision_text)

        # Extract analysis summary (text before the decision marker)
        analysis_summary = decision_text
        for marker in ("【决策：续写第二卷】", "【决策：修改后继续】", "【决策：收束结局】"):
            if marker in decision_text:
                analysis_summary = decision_text.split(marker)[0].strip()
                break

        # Step C: Revisions are NOT auto-applied — user confirms in frontend
        # Generate v2 outline now if LLM recommended it
        volume_2_outline = None
        if parsed_decision == "续写第二卷":
            v2_preview = novel_so_far[:3000]
            v2_prompt = V2_OUTLINE_PROMPT_TEMPLATE.format(novel_content_preview=v2_preview)
            v2_messages = [
                {"role": "system", "content": V2_OUTLINE_SYSTEM_PROMPT},
                {"role": "user", "content": v2_prompt},
            ]
            volume_2_outline = (await provider.chat(v2_messages)).strip()

        # Step D: Save state to step_data (original chapters, not revised)
        review_report = {
            "review_text": final_report,
            "decision": decision_text,
            "parsed_decision": parsed_decision,
            "analysis_summary": analysis_summary,
        }

        updated_sd: dict = {
            **sd,
            "chapters": list(chapters),  # original, unmodified
            "totalChapters": total_chapters,
            "generateMode": "interactive",
            "novelContent": novel_so_far,
            "volumeReviewState": "pending_review",
            "volumeReviewReport": review_report,
            "volumeReviewDecision": None,  # user hasn't decided yet
        }
        if volume_2_outline:
            updated_sd["volume2Outline"] = volume_2_outline

        updated_draft = await self._repo.update(
            draft_id=draft.id,
            current_step="generate",
            step_data=updated_sd,
        )

        last_chapter = chapters[-1] if chapters else {"title": "", "content": ""}

        return {
            "chapter_num": len(chapters),
            "chapter_title": last_chapter.get("title", ""),
            "chapter_content": last_chapter.get("content", ""),
            "total_chapters": total_chapters,
            "draft": updated_draft,
            "quality_check_needed": False,
            "volume_review": {
                "volume_review_report": review_report,
                "chapter_count": len(chapters),
                "total_chapters": total_chapters,
                "volume_2_outline": volume_2_outline,
                "revised_chapters": applied_revisions if applied_revisions else None,
            },
        }

    async def submit_volume_decision(
        self,
        draft_id: UUID,
        user_id: UUID,
        decision: str,
        gen_model: str | None = None,
        apply_revisions: bool = False,
    ) -> dict:
        """Handle the user's decision after viewing the volume review.

        Called from the /volume-decision endpoint.
        Returns a dict compatible with GenerateChapterResp or SubmitVolumeDecisionResp.
        """
        draft = await self._repo.get_by_id(draft_id)
        if draft is None:
            raise ValueError("Draft not found")
        if str(draft.user_id) != str(user_id):
            raise ValueError("Draft does not belong to this user")

        sd = draft.step_data or {}
        sd.setdefault("schema_version", SCHEMA_VERSION)
        chapters = sd.get("chapters", [])
        total_chapters = sd.get("totalChapters", 30)
        custom_prompt = sd.get("customPrompt", "")
        volume_outline = sd.get("volumeOutlineText", "")
        references = sd.get("references", [])
        character_rules = sd.get("characterRulesText", "")

        # Apply revisions if user confirmed
        revisions = parse_review_chapter_revisions(
            (sd.get("volumeReviewReport") or {}).get("review_text", "")
        )
        if apply_revisions and revisions:
            for ch_idx, revised_text in revisions.items():
                if 0 <= ch_idx < len(chapters):
                    chapters[ch_idx] = {
                        "title": chapters[ch_idx].get("title", f"第{ch_idx+1}章"),
                        "content": revised_text,
                    }

        if decision == "修改后继续":
            updated_sd = {
                **sd,
                "chapters": chapters,
                "volumeReviewState": "completed",
                "volumeReviewDecision": decision,
            }
            # Rebuild novelContent if revisions were applied
            if apply_revisions and revisions:
                updated_sd["novelContent"] = "\n\n---\n\n".join(
                    f"# {ch['title']}\n\n{ch['content']}" for ch in chapters
                )
            updated_draft = await self._repo.update(
                draft_id=draft_id,
                current_step="generate",
                step_data=updated_sd,
            )
            return {
                "message": "修改已完成，第一卷已完结",
                "volume_2_outline": None,
                "new_total_chapters": total_chapters,
                "draft": updated_draft,
            }

        new_total = 40 if decision == "续写第二卷" else 35
        state = "executing_v2" if decision == "续写第二卷" else "executing_closing"

        updated_sd = {
            **sd,
            "volumeReviewState": state,
            "volumeReviewDecision": decision,
            "totalChapters": new_total,
            "volume2ChaptersWritten": sd.get("volume2ChaptersWritten", 0),
            "closingChaptersWritten": sd.get("closingChaptersWritten", 0),
        }

        if decision == "续写第二卷":
            volume_2_outline = sd.get("volume2Outline", "")
            # Generate first v2 chapter (chapter 31)
            next_chapter_num = len(chapters) + 1
            provider = await self._resolve_provider(user_id, gen_model)

            v2_prompt = (
                f"【第二卷·本章写作指令】\n"
                f"- 章节编号：第{next_chapter_num}章\n"
                f"- 第二卷细纲参考：\n{volume_2_outline}\n"
                f"- 字数要求：1800-2000字\n\n"
                f"请开始写第{next_chapter_num}章正文，延续第一卷的风格和人物设定，推进第二卷的剧情。"
            )
            v2_messages = [
                {"role": "system", "content": "你是一名专业小说作家，正在逐章创作原创小说。你已经进入第二卷的创作，保持与前文一致的风格和质量。"},
                {"role": "user", "content": v2_prompt},
            ]
            chapter_text = (await provider.chat(v2_messages)).strip()
            chapter_title = f"第{next_chapter_num}章"
            heading_match = re.search(r"^#+\s+(.+)$", chapter_text, re.MULTILINE)
            if heading_match:
                chapter_title = heading_match.group(1).strip()

            new_chapter = {"title": chapter_title, "content": chapter_text}
            updated_chapters = chapters + [new_chapter]
            updated_sd["chapters"] = updated_chapters
            updated_sd["volume2ChaptersWritten"] = 1
            updated_sd["novelContent"] = "\n\n---\n\n".join(
                f"# {ch['title']}\n\n{ch['content']}" for ch in updated_chapters
            )

            updated_draft = await self._repo.update(
                draft_id=draft_id,
                current_step="generate",
                step_data=updated_sd,
            )

            return {
                "chapter_num": next_chapter_num,
                "chapter_title": chapter_title,
                "chapter_content": chapter_text,
                "total_chapters": new_total,
                "draft": updated_draft,
                "quality_check_needed": False,
            }

        # ── "收束结局" ──
        next_chapter_num = len(chapters) + 1
        provider = await self._resolve_provider(user_id, gen_model)

        closing_prompt = (
            f"第{next_chapter_num}章（结局卷）\n\n"
            f"{CLOSING_ARC_NOTES}\n\n请开始写第{next_chapter_num}章正文。"
        )
        closing_messages = [
            {"role": "system", "content": "你是一名专业小说作家。你正在为故事写结局，请确保所有主要线索得到收束，给读者满意的完结感。"},
            {"role": "user", "content": closing_prompt},
        ]
        chapter_text = (await provider.chat(closing_messages)).strip()
        chapter_title = f"第{next_chapter_num}章"
        heading_match = re.search(r"^#+\s+(.+)$", chapter_text, re.MULTILINE)
        if heading_match:
            chapter_title = heading_match.group(1).strip()

        new_chapter = {"title": chapter_title, "content": chapter_text}
        updated_chapters = chapters + [new_chapter]
        updated_sd["chapters"] = updated_chapters
        updated_sd["closingChaptersWritten"] = 1
        updated_sd["novelContent"] = "\n\n---\n\n".join(
            f"# {ch['title']}\n\n{ch['content']}" for ch in updated_chapters
        )

        updated_draft = await self._repo.update(
            draft_id=draft_id,
            current_step="generate",
            step_data=updated_sd,
        )

        return {
            "chapter_num": next_chapter_num,
            "chapter_title": chapter_title,
            "chapter_content": chapter_text,
            "total_chapters": new_total,
            "draft": updated_draft,
            "quality_check_needed": False,
        }

    async def _generate_next_volume_chapter(
        self, draft, sd, chapters, total_chapters,
        custom_prompt, volume_outline, references,
        character_rules, user_id, gen_model,
    ) -> dict:
        """Generate the next chapter in volume 2 or closing arc."""
        state = sd.get("volumeReviewState", "")
        decision = sd.get("volumeReviewDecision", "")
        next_chapter_num = len(chapters) + 1

        provider = await self._resolve_provider(user_id, gen_model)

        if state == "executing_v2":
            volume_2_outline = sd.get("volume2Outline", "")
            v2_prompt = (
                f"【第二卷·本章写作指令】\n"
                f"- 章节编号：第{next_chapter_num}章\n"
                f"- 第二卷细纲参考：\n{volume_2_outline}\n"
                f"- 字数要求：1800-2000字\n\n"
                f"请开始写第{next_chapter_num}章正文，延续第一卷的风格和人物设定，推进第二卷的剧情。"
            )
            messages = [
                {"role": "system", "content": "你是一名专业小说作家，正在逐章创作原创小说。你已经进入第二卷的创作，保持与前文一致的风格和质量。"},
                {"role": "user", "content": v2_prompt},
            ]
        else:
            # closing arc
            closing_prompt = (
                f"第{next_chapter_num}章（结局卷）\n\n"
                f"{CLOSING_ARC_NOTES}\n\n请开始写第{next_chapter_num}章正文。"
            )
            messages = [
                {"role": "system", "content": "你是一名专业小说作家。你正在为故事写结局，请确保所有主要线索得到收束，给读者满意的完结感。"},
                {"role": "user", "content": closing_prompt},
            ]

        chapter_text = (await provider.chat(messages)).strip()
        chapter_title = f"第{next_chapter_num}章"
        heading_match = re.search(r"^#+\s+(.+)$", chapter_text, re.MULTILINE)
        if heading_match:
            chapter_title = heading_match.group(1).strip()

        # ── Per-chapter quality check (same as _generate_single_chapter) ──
        if character_rules.strip():
            qc_prompt = (
                f"你是一名严格的小说质检编辑。请检查这一章是否满足以下三项要求：\n\n"
                f"要求1：剧情推进——该章必须有具体的剧情事件发生，不能停留于描述状态或心理活动\n"
                f"要求2：结尾钩子——最后一段必须有强力悬念、反转或扣人心弦的结尾\n"
                f"要求3：人设一致——主角言行必须符合以下人物行为守则：\n"
                f"{character_rules}\n\n"
                f"【正文】\n{chapter_text}\n\n"
                "请逐项分析，然后输出一个JSON对象（不要markdown代码块标记）：\n"
                '{"pass": true/false, "reason": "如不通过，简述不合格原因和对应的要求编号"}'
            )
            qc_messages = [
                {"role": "system", "content": "你是一名严格的小说质检编辑。"},
                {"role": "user", "content": qc_prompt},
            ]
            try:
                qc_raw = (await provider.chat(qc_messages)).strip()
                qc_raw = re.sub(r"^```(?:json)?\s*", "", qc_raw)
                qc_raw = re.sub(r"\s*```$", "", qc_raw)
                qc_result = json.loads(qc_raw)
                if not qc_result.get("pass", True):
                    rewrite_prompt = (
                        f"【质检报告】\n{chapter_text}\n\n"
                        f"【修改要求】\n{qc_result.get('reason', '')}\n\n"
                        "请修改上述章节，只修改有问题的部分。保留其他内容不变。\n"
                        "输出完整的修改后正文。"
                    )
                    rewrite_messages = [
                        {"role": "system", "content": "你是一名资深小说作家。请根据质检要求修改本章，只改有问题的部分。输出完整的修改后正文。"},
                        {"role": "user", "content": rewrite_prompt},
                    ]
                    chapter_text = (await provider.chat(rewrite_messages)).strip()
                    heading_match = re.search(r"^#+\s+(.+)$", chapter_text, re.MULTILINE)
                    if heading_match:
                        chapter_title = heading_match.group(1).strip()
            except json.JSONDecodeError:
                logger.warning("Volume review quality check JSON parse failed, skipping auto-rewrite")

        new_chapter = {"title": chapter_title, "content": chapter_text}
        updated_chapters = chapters + [new_chapter]

        # Track v2/closing progress
        v2_written = sd.get("volume2ChaptersWritten", 0)
        closing_written = sd.get("closingChaptersWritten", 0)
        max_v2 = 10
        max_closing = 5

        if state == "executing_v2":
            v2_written += 1
        else:
            closing_written += 1

        # Determine if we're done with v2/closing arc
        v2_done = state == "executing_v2" and v2_written >= max_v2
        closing_done = state == "executing_closing" and closing_written >= max_closing

        if v2_done or closing_done:
            # ── Final comprehensive review of entire novel ──
            provider = await self._resolve_provider(user_id, gen_model)
            volume_label = "第二卷" if v2_done else "结局卷"
            accumulated = "\n\n".join(
                f"第{i+1}章：{ch['title']}\n\n{ch['content']}"
                for i, ch in enumerate(updated_chapters)
            )

            final_review_prompt = (
                f"请通读已完成的所有{len(updated_chapters)}章正文，做全书最终检查：\n"
                f"1. **时间线**：列出全部章节的时间轴，检查有无矛盾。\n"
                f"2. **人物轨迹**：所有角色线索是否全部收束？主角成长弧是否完整？\n"
                f"3. **能力系统**：主角能力成长曲线是否平滑合理？\n"
                f"4. **节奏报告**：用★标出全书情绪高点，用—标出拖沓段落。\n"
                f"5. **结局完整性**：结局是否给读者以充分的满足感？所有伏笔是否回收？\n\n"
                f"【修改要求】如果发现某章节需要修改，请用【第X章修改】作为标记，输出完整修改版本。"
            )
            review_messages = [
                {"role": "system", "content": "你是一名资深小说编辑，负责全书最终检查。"},
                {"role": "user", "content": f"已完成全部{len(updated_chapters)}章：\n\n{accumulated}\n\n{final_review_prompt}"},
            ]
            final_report = (await provider.chat(review_messages)).strip()

            # Parse revisions (do not auto-apply)
            revisions = parse_review_chapter_revisions(final_report)
            applied_revisions = []
            for ch_idx, revised_text in revisions.items():
                if 0 <= ch_idx < len(updated_chapters):
                    applied_revisions.append({
                        "chapter_index": ch_idx,
                        "title": updated_chapters[ch_idx].get("title", f"第{ch_idx+1}章"),
                        "content": revised_text,
                    })

            novel_content = "\n\n---\n\n".join(
                f"# {ch['title']}\n\n{ch['content']}" for ch in updated_chapters
            )

            updated_sd = {
                **sd,
                "chapters": updated_chapters,
                "totalChapters": total_chapters,
                "generateMode": "interactive",
                "novelContent": novel_content,
                "volumeReviewState": "pending_final_review",
                "volume2ChaptersWritten": v2_written,
                "closingChaptersWritten": closing_written,
                "finalReviewReport": final_report,
                "finalReviewRevisions": applied_revisions,
            }

            updated_draft = await self._repo.update(
                draft_id=draft.id,
                current_step="generate",
                step_data=updated_sd,
            )

            return {
                "chapter_num": next_chapter_num,
                "chapter_title": chapter_title,
                "chapter_content": chapter_text,
                "total_chapters": total_chapters,
                "draft": updated_draft,
                "quality_check_needed": False,
                "final_review": {
                    "report": final_report,
                    "chapter_count": len(updated_chapters),
                    "total_chapters": total_chapters,
                    "revised_chapters": applied_revisions if applied_revisions else None,
                },
            }

        # Not done yet — continue generating
        new_state = state

        novel_content = "\n\n---\n\n".join(
            f"# {ch['title']}\n\n{ch['content']}" for ch in updated_chapters
        )

        updated_sd = {
            **sd,
            "chapters": updated_chapters,
            "totalChapters": total_chapters,
            "generateMode": "interactive",
            "novelContent": novel_content,
            "volumeReviewState": new_state,
            "volume2ChaptersWritten": v2_written,
            "closingChaptersWritten": closing_written,
        }

        updated_draft = await self._repo.update(
            draft_id=draft.id,
            current_step="generate",
            step_data=updated_sd,
        )

        return {
            "chapter_num": next_chapter_num,
            "chapter_title": chapter_title,
            "chapter_content": chapter_text,
            "total_chapters": total_chapters,
            "draft": updated_draft,
            "quality_check_needed": False,
        }

    async def submit_final_decision(
        self,
        draft_id: UUID,
        user_id: UUID,
        apply_revisions: bool = False,
        mark_complete: bool = True,
    ) -> dict:
        """Handle the user's decision after the final novel review.

        Can apply revisions and/or mark the novel as complete.
        """
        draft = await self._repo.get_by_id(draft_id)
        if draft is None:
            raise ValueError("Draft not found")
        if str(draft.user_id) != str(user_id):
            raise ValueError("Draft does not belong to this user")

        sd = draft.step_data or {}
        sd.setdefault("schema_version", SCHEMA_VERSION)
        chapters = list(sd.get("chapters", []))

        # Apply revisions if requested
        revisions = sd.get("finalReviewRevisions", [])
        if apply_revisions and revisions:
            for rev in revisions:
                ch_idx = rev.get("chapter_index")
                if isinstance(ch_idx, int) and 0 <= ch_idx < len(chapters):
                    chapters[ch_idx] = {
                        "title": rev.get("title", chapters[ch_idx].get("title", f"第{ch_idx+1}章")),
                        "content": rev.get("content", chapters[ch_idx].get("content", "")),
                    }

        novel_content = "\n\n---\n\n".join(
            f"# {ch['title']}\n\n{ch['content']}" for ch in chapters
        )

        updated_sd = {
            **sd,
            "chapters": chapters,
            "novelContent": novel_content,
            "volumeReviewState": "completed",
            "finalReviewApplied": apply_revisions,
        }

        updated_draft = await self._repo.update(
            draft_id=draft_id,
            current_step="generate",
            status="completed" if mark_complete else "in_progress",
            step_data=updated_sd,
        )

        return {
            "message": "小说已完结" if mark_complete else "修改已应用",
            "draft": updated_draft,
        }

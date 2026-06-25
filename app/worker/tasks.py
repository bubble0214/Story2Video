from __future__ import annotations

import asyncio
import re
import sys
import logging
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.celery import celery_app
from app.core.config import settings
from app.providers.llm import LLMFactory
from app.providers.prompt import LyricsPromptBuilder, NovelPromptBuilder, ScriptPromptBuilder
from app.providers.prompt.novel import build_chapter_messages
from app.repositories.novel import NovelRepository
from app.repositories.task import TaskRepository
from app.utils.llm_key import resolve_user_llm_key

logger = logging.getLogger(__name__)

# ── Helper: fetch task ────────────────────────────────────────────────


async def _get_task(task_id: UUID, session: AsyncSession) -> dict | None:
    """Fetch a task record and return its checkpoint + input data."""
    repo = TaskRepository(session)
    obj = await repo.get_by_id(task_id)
    if obj is None:
        return None
    return {
        "id": obj.id,
        "status": obj.status,
        "progress": obj.progress,
        "current_step": obj.current_step,
        "input_params": obj.input_params,
        "checkpoint_data": obj.checkpoint_data,
        "result": obj.result,
    }


async def _set_checkpoint(
    task_id: UUID,
    status: str,
    progress: float,
    current_step: str,
    error: str = "",
    checkpoint: dict | None = None,
    result: dict | None = None,
    session: AsyncSession | None = None,
) -> None:
    """Persist workflow progress so we can resume after failure."""
    if session is None:
        raise RuntimeError("_set_checkpoint requires a session")
    repo = TaskRepository(session)
    await repo.update_status(
        task_id=task_id,
        status=status,
        progress=progress,
        current_step=current_step,
        error_message=error,
        checkpoint_data=checkpoint,
        result=result,
    )


# ── Step implementations ──────────────────────────────────────────────


async def _step_search_references(
    input_params: dict, context: dict | None = None, user_id: UUID | None = None,
) -> dict:
    """Search reference novels via vector similarity on tags/keywords."""
    _ = context  # unused but required by workflow engine signature

    # If reference_data is provided (from LLM-based search on the frontend),
    # pass it through directly without DB lookup.
    reference_data = input_params.get("reference_data")
    if reference_data and isinstance(reference_data, list) and len(reference_data) > 0:
        return {"references": reference_data}

    # If specific reference IDs are provided, fetch those novels directly
    reference_ids = input_params.get("reference_ids")
    if reference_ids and isinstance(reference_ids, list) and len(reference_ids) > 0:
        session: AsyncSession = input_params.get("_session")
        if session is None:
            raise RuntimeError("_step_search_references requires _session in input_params")
        repo = NovelRepository(session)
        references = []
        for rid in reference_ids:
            novel = await repo.get_by_id(UUID(rid))
            if novel:
                references.append({
                    "id": str(novel.id),
                    "title": novel.title,
                    "author": novel.author,
                    "tags": novel.tags,
                    "summary": novel.summary,
                })
        return {"references": references}

    # No reference data or IDs — use LLM to recommend novels based on tags/keywords
    tags = input_params.get("tags", "")
    keywords = [t.strip() for t in tags.split(",") if t.strip()]
    if not keywords:
        return {"references": []}

    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    try:
        llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    except ValueError:
        logger.warning("No LLM key found, skipping reference search")
        return {"references": []}

    if llm_provider == "custom":
        llm_provider = "openai"

    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    # Use NovelService to get LLM recommendations
    from app.services.novel import NovelService
    svc = NovelService(None, provider)
    try:
        entities = await svc.search(keywords)
    except Exception:
        logger.warning("LLM recommendation failed, skipping reference search", exc_info=True)
        return {"references": []}

    references = [
        {
            "id": e.id,
            "title": e.title,
            "author": e.author,
            "tags": e.tags,
            "summary": e.summary,
            "score": e.score,
        }
        for e in entities
    ]
    return {"references": references}


async def _step_generate_novel(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a novel via the LLM provider."""
    # If novel_content is already provided (e.g. from script workflow), pass through
    existing = input_params.get("novel_content", "")
    if existing:
        title = None
        for line in existing.split("\n"):
            line = line.strip()
            if line.startswith("# ") or line.startswith("## "):
                title = line.lstrip("# ").strip()
                break
        if not title:
            title = input_params.get("custom_prompt", "Untitled").split("\n")[0][:60]
        return {"novel_content": existing, "title": title}
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    custom_prompt = input_params.get("custom_prompt")
    refs = context.get("references", [])

    if custom_prompt:
        # User-provided prompt mode: use custom instructions + references
        parts = [f"# Instructions\n{custom_prompt}"]
        if refs:
            ref_text = "\n".join(
                f"- {r['title']} (by {r.get('author', 'unknown')}): {r['summary'][:500]}"
                for r in refs
            )
            parts.append(f"# Reference Novels\n{ref_text}")
        # If a volume outline was generated, use it (more detailed)
        volume_outline = input_params.get("volume_outline_text") or context.get("volume_outline_text", "")
        if volume_outline.strip():
            parts.append(f"# Novel Outline (Volume Detail)\n{volume_outline.strip()}")
            parts.append("Write the novel following the volume outline above. Each chapter should be clearly separated with markdown headings. Write all 30 chapters of Volume 1.")
        else:
            # Fall back to the general outline
            outline_text = input_params.get("outline_text") or context.get("outline_text", "")
            if outline_text.strip():
                parts.append(f"# Novel Outline\n{outline_text.strip()}")
                parts.append("Write the novel following the outline above. Each chapter should be clearly separated with markdown headings.")
        # If character behavior rules were generated, append them as constraints
        character_rules = input_params.get("character_rules_text") or context.get("character_rules_text", "")
        if character_rules.strip():
            parts.append(f"# Character Behavior Rules (must follow strictly)\n{character_rules.strip()}")
            parts.append("IMPORTANT: Every character's dialogue, decisions, and reactions MUST be consistent with their established behavior rules above. Do not deviate from these rules.")
        parts.append("\nPlease write the complete novel in markdown format based on the instructions above. The novel should be original and creative, drawing inspiration from the reference novels.")  # noqa: E501
        messages = [
            {"role": "system", "content": "You are a professional novelist. Write an original, compelling story based on the user's instructions and reference materials."},
            {"role": "user", "content": "\n\n".join(parts)},
        ]
    else:
        builder = NovelPromptBuilder()
        messages = builder.build(
            title=input_params.get("title", "Untitled"),
            tags=input_params.get("tags", ""),
            outline=input_params.get("outline", ""),
            style=input_params.get("style", ""),
            word_count=input_params.get("word_count", 2000),
        )
        if refs:
            ref_text = "\n\nReference novels:\n" + "\n".join(
                f"- {r['title']}: {r['summary'][:300]}" for r in refs
            )
            messages[1]["content"] += ref_text

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    # Extract a title from the first heading or fall back to input
    title = None
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("# ") or line.startswith("## "):
            title = line.lstrip("# ").strip()
            break
    if not title:
        title = input_params.get("custom_prompt", "Untitled").split("\n")[0][:60]
    return {"novel_content": content, "title": title}


async def _step_generate_outline(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a chapter outline for a long novel."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    custom_prompt = input_params.get("custom_prompt", "")
    refs = context.get("references", [])
    task_id = input_params.get("_task_id")
    session = input_params.get("_session")

    logger.info("=== _step_generate_outline custom_prompt (first 500 chars) === %s", custom_prompt[:500])
    logger.info("=== _step_generate_outline refs count === %s", len(refs))

    # Progress: preparing prompt
    if task_id and session:
        await _set_checkpoint(
            UUID(task_id), "RUNNING", 50.0, "outline: preparing prompt",
            checkpoint=input_params.get("_checkpoint_data"),
            session=session,
        )

    parts = [f"# User Instructions\n{custom_prompt}"]
    if refs:
        ref_text = "\n".join(
            f"- {r['title']} (by {r.get('author', 'unknown')}): {r['summary'][:500]}"
            for r in refs
        )
        parts.append(f"# Reference Novels\n{ref_text}")

    messages = [
        {
            "role": "system",
            "content": "你是一名专业小说大纲设计师。请严格按照用户的要求输出小说大纲，"
            "包括世界观、人物设定、核心冲突、故事梗概等。"
            "输出格式完全遵循用户指定的格式，不要添加额外说明。"
            "第一行请输出小说名称（使用 # 小说名），不要输出'新小说大纲'等通用标题。",
        },
        {"role": "user", "content": "\n\n".join(parts)},
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    # Progress: calling LLM
    if task_id and session:
        await _set_checkpoint(
            UUID(task_id), "RUNNING", 60.0, "outline: generating with AI",
            checkpoint=input_params.get("_checkpoint_data"),
            session=session,
        )

    content = await provider.chat(messages)

    logger.info("=== _step_generate_outline raw LLM response (first 800 chars) === %s", content[:800])

    # Return the raw text outline — no JSON parsing needed
    return {"outline_text": content.strip()}


async def _step_generate_volume_outline(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a detailed 30-chapter volume outline from the story outline."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    custom_prompt = input_params.get("custom_prompt", "")
    outline_text = input_params.get("outline_text") or context.get("outline_text", "")

    parts = [f"# User Instructions\n{custom_prompt}"]

    # Inject the story outline
    parts.append(f"# Story Outline\n{outline_text}")

    # Volume outline generation prompt
    volume_prompt = (
        "【身份延续】你依然是这位专业小说作家。现有大纲如下：\n"
        "[粘贴已生成的故事大纲]\n"
        "【任务】请重点规划小说第一卷。该卷共30章，请以每3章为一个\"情节单元\"来组织，共10个单元。每个单元需包含：\n"
        "- 单元核心任务（这3章共同推进什么）\n"
        "- 每章的1句话梗概（第X章：具体发生什么）\n"
        "- 关键转折点或伏笔植入位置\n\n"
        "要求：\n"
        "1. 前3章（第一单元）必须构成\"黄金开局\"：强悬念切入→主角被动应对→结尾主动选择入局。\n"
        "2. 每章结尾都要有钩子或悬念，驱动读者看下一章。\n"
        "3. 全卷节奏呈波浪式：紧→松→紧→松，高潮前置，中期有情感呼吸点。"
    )
    parts.append(f"# Volume Outline Task\n{volume_prompt}")

    messages = [
        {
            "role": "system",
            "content": "你是一名专业小说大纲设计师。请严格按照用户的要求输出第一卷详细章节细纲。",
        },
        {"role": "user", "content": "\n\n".join(parts)},
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)

    return {"volume_outline_text": content.strip()}


async def _step_generate_character_rules(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate detailed character behavior rules based on the volume outline."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    volume_outline = input_params.get("volume_outline_text") or context.get("volume_outline_text", "")
    custom_prompt = context.get("custom_prompt", "")

    parts = [f"# Volume Outline\n{volume_outline}"]
    if custom_prompt:
        parts.append(f"# Original Creation Prompt\n{custom_prompt}")

    user_prompt = (
        "基于以上大纲和创作提示中的人物设定，请为角色【主角】建立详细的人物行为守则：\n\n"
        "1. **说话方式**：口头禅/惯用句式/说话节奏（如：短句多还是长句多？会用反问吗？）\n"
        "2. **应激反应**：被背叛时的第一反应（攻击/沉默/假装没发现？）被示好时的反应（信任/戒备/表面热情？）\n"
        "3. **决策偏好**：遇事更倾向\"谋定后动\"还是\"先打再说\"？在\"救一人还是救大局\"的抉择中倾向哪边？\n"
        "4. **能力边界**：目前能力的上限和代价是什么？什么情况下会失控？\n"
        "5. **情感弱点**：最能击溃ta心理防线的一句话或一种情境是什么？\n\n"
        "请同样为核心盟友【盟友】和核心对手【对手】分别生成简化版（各3条）。"
    )
    parts.append(f"# Character Behavior Rules Task\n{user_prompt}")

    messages = [
        {
            "role": "system",
            "content": "你是一名专业小说角色设计师。请根据大纲中的人物设定，为每个核心角色建立细致的人物行为守则，确保角色言行一致、不崩坏。",
        },
        {"role": "user", "content": "\n\n".join(parts)},
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)

    return {"character_rules_text": content.strip()}


async def _step_generate_novel_by_chapters(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate novel chapter by chapter, using per-chapter prompt template."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    custom_prompt = context.get("custom_prompt", "")
    refs = context.get("references", [])
    volume_outline = context.get("volume_outline_text", "")
    character_rules = context.get("character_rules_text", "")

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    all_chapters: list[str] = []
    total_chapters = 30

    for chapter_num in range(1, total_chapters + 1):
        messages = build_chapter_messages(
            custom_prompt=custom_prompt,
            references=refs,
            volume_outline=volume_outline,
            character_rules=character_rules,
            chapter_num=chapter_num,
        )

        chapter_text = (await provider.chat(messages)).strip()

        # ── Self-review: check quality and fix if needed ──
        review_prompt = (
            f"通读刚生成的第{chapter_num}章，检查：\n"
            f"1. 是否完成了所有「必须达成的任务」？\n"
            f"2. 结尾钩子力度够不够？\n"
            f"3. 主角的言行是否符合人设硬约束？\n"
            f"如有不合格项，请针对性修改。\n\n"
            f"如果合格，请回复「【本章合格】」并输出原文。\n"
            f"如果不合格，请回复「【修改版本】」并输出修改后的完整章节。"
        )

        review_messages = [
            {"role": "system", "content": "你是一名严格的小说编辑，负责检查章节质量。请仔细检查并按要求输出。"},
            {"role": "user", "content": f"以下是第{chapter_num}章正文：\n\n{chapter_text}\n\n{review_prompt}"},
        ]

        reviewed = (await provider.chat(review_messages)).strip()

        # Extract the final chapter text from review response
        if "【修改版本】" in reviewed:
            final_chapter = reviewed.split("【修改版本】")[-1].strip()
        elif "【本章合格】" in reviewed:
            final_chapter = reviewed.split("【本章合格】")[-1].strip()
        else:
            final_chapter = reviewed

        all_chapters.append(final_chapter)

        # ── Periodic batch review (every 10 chapters) ──
        if chapter_num == 10 or chapter_num == 20:
            accumulated = "\n\n".join(all_chapters)
            batch_prompt = (
                f"请阅读已完成的第1-{chapter_num}章正文，做以下检查：\n"
                f"1. **时间线**：所有事件发生的先后顺序有无矛盾？列出时间轴。\n"
                f"2. **人物轨迹**：主角目前手握几条线索？各推进到什么程度？有无遗漏的伏笔？\n"
                f"3. **能力系统**：主角能力的强弱表现是否前后一致？如有波动，请指出并给出修改建议。\n"
                f"4. **节奏报告**：用★标出{chapter_num}章中的情绪高点，用—标出拖沓段落，给出后续章节的节奏调整建议。\n\n"
                f"【修改要求】如果发现某章节需要修改，请用【第X章修改】作为标记（X为章节数字），"
                f"然后输出该章的完整修改版本。无需修改的章节不要输出。"
            )
            batch_messages = [
                {"role": "system", "content": "你是一名资深小说编辑，负责阶段性复盘检查。严格按检查项逐一分析，按格式输出修改。"},
                {"role": "user", "content": f"已完成章节（第1-{chapter_num}章）：\n\n{accumulated}\n\n{batch_prompt}"},
            ]
            review_report = (await provider.chat(batch_messages)).strip()

            # Parse and apply chapter revisions
            for match in re.finditer(r"【第(\d+)章修改】", review_report):
                ch_idx = int(match.group(1)) - 1  # 0-indexed
                start = match.end()
                next_marker = re.search(r"【第\d+章修改】", review_report[start:])
                revised = (
                    review_report[start:start + next_marker.start()].strip()
                    if next_marker else review_report[start:].strip()
                )
                if 0 <= ch_idx < len(all_chapters) and revised:
                    all_chapters[ch_idx] = revised


    # ── Final review (chapter 30) ──
    accumulated_30 = "\n\n".join(all_chapters)
    final_review_prompt = (
        f"请通读已完成的所有30章正文，做最终检查：\n"
        f"1. **时间线**：列出第1-30章的时间轴，检查有无矛盾。\n"
        f"2. **人物轨迹**：所有线索是否收束或为下一卷做好准备？\n"
        f"3. **能力系统**：主角能力成长曲线是否平滑合理？\n"
        f"4. **节奏报告**：用★标出全书情绪高点，用—标出拖沓段落。\n\n"
        f"【修改要求】如果发现某章节需要修改，请用【第X章修改】作为标记，输出完整修改版本。"
    )
    final_batch_messages = [
        {"role": "system", "content": "你是一名资深小说编辑，负责全书最终检查。"},
        {"role": "user", "content": f"已完成全部30章：\n\n{accumulated_30}\n\n{final_review_prompt}"},
    ]
    final_report = (await provider.chat(final_batch_messages)).strip()

    for match in re.finditer(r"【第(\d+)章修改】", final_report):
        ch_idx = int(match.group(1)) - 1
        start = match.end()
        next_marker = re.search(r"【第\d+章修改】", final_report[start:])
        revised = (
            final_report[start:start + next_marker.start()].strip()
            if next_marker else final_report[start:].strip()
        )
        if 0 <= ch_idx < len(all_chapters) and revised:
            all_chapters[ch_idx] = revised

    # ── Story state analysis & next-steps decision ──
    novel_so_far = "\n\n".join(all_chapters)
    decision_prompt = (
        "请阅读以上已完成的第一卷正文，分析当前故事状态并决定下一步：\n\n"
        "1. **写得顺手，伏笔还有空间**：故事推进顺利，埋下的伏笔尚未全部回收，"
        "有明显可以延续到第二卷的线索。→ 生成第二卷细纲，继续写作。\n"
        "2. **发现一些问题需要调整**：时间线/人物/能力/节奏存在需要修改的问题。"
        "→ 修改已有章节后再继续。（注意：如果前面已修改过，请确保修改到位）\n"
        "3. **故事可以收束了**：主线冲突已经或即将解决，继续写会导致注水。"
        "→ 直接写结局收束。\n\n"
        "请先简要分析故事状态，然后输出决策结果：\n"
        "如果选1，请回复【决策：续写第二卷】\n"
        "如果选2，请回复【决策：修改后继续】\n"
        "如果选3，请回复【决策：收束结局】\n\n"
        "注意：一部完整的网络小说通常在100章以上，如果当前只完成了30章，"
        "且故事明显还有大量可写内容，请优先选择选项1。"
    )
    decision_messages = [
        {"role": "system", "content": "你是一名资深小说主编，负责根据已完成内容规划后续创作方向。"},
        {"role": "user", "content": f"已完成的第一卷正文：\n\n{novel_so_far}\n\n{decision_prompt}"},
    ]
    decision = (await provider.chat(decision_messages)).strip()

    # Execute the decision
    if "续写第二卷" in decision:
        # Generate volume 2 outline first
        v2_outline_prompt = (
            "你已经完成了第一卷（30章）的创作。现在请规划第二卷的章节细纲。\n\n"
            f"【第一卷已有内容概要】\n{novel_so_far[:3000]}\n\n"
            "请基于第一卷已展开的线索、未回收的伏笔、人物的成长空间，规划第二卷（10章）的细纲。"
            "每章需包含：一句话梗概、情绪基调、核心冲突、伏笔植入、结尾钩子。\n\n"
            "请按以下格式输出：\n"
            "第31章：[梗概] | [情绪基调] | [核心冲突] | [伏笔] | [钩子]\n"
            "第32章：...\n"
            "（以此类推到第40章）"
        )
        v2_messages = [
            {"role": "system", "content": "你是一名资深小说大纲设计师，擅长规划长篇故事的续作结构。"},
            {"role": "user", "content": v2_outline_prompt},
        ]
        v2_outline = (await provider.chat(v2_messages)).strip()
        all_chapters.append(f"\n\n## 第二卷\n\n（第二卷细纲：\n{v2_outline}\n）\n")

        # Write up to 10 chapters for volume 2
        v2_chapter_count = 10
        for v2_chapter_num in range(31, 31 + v2_chapter_count):
            v2_messages = build_chapter_messages(
                custom_prompt=custom_prompt,
                references=refs,
                volume_outline=volume_outline or v2_outline,
                character_rules=character_rules,
                chapter_num=v2_chapter_num,
                volume_label="第二卷",
            )
            v2_text = (await provider.chat(v2_messages)).strip()
            all_chapters.append(v2_text)

    elif "收束结局" in decision:
        # Write a closing arc (5 chapters)
        closing_notes = (
            "根据分析，故事已进入收束阶段。请写出第31-35章作为结局卷：\n"
            "- 第31章：最终冲突升级，所有线索汇聚\n"
            "- 第32章：高潮对决/关键转折\n"
            "- 第33章：余波与角色成长\n"
            "- 第34章：伏笔回收与主题升华\n"
            "- 第35章：结局尾声\n\n"
            "每章1800-2000字，保持前后一致。"
        )
        for closing_num in range(31, 36):
            closing_messages = build_chapter_messages(
                custom_prompt=custom_prompt,
                references=refs,
                volume_outline=volume_outline,
                character_rules=character_rules,
                chapter_num=closing_num,
                volume_label="结局卷",
            )
            closing_text = (await provider.chat(closing_messages)).strip()
            all_chapters.append(closing_text)
    # else (option 2: 修改后继续): fixes already applied above, just proceed

    novel = "\n\n".join(all_chapters)

    # Extract a title from the first chapter heading if possible
    title = None
    for line in novel.split("\n"):
        line = line.strip()
        if line.startswith("# ") or line.startswith("## "):
            title = line.lstrip("# ").strip()
            break
    if not title:
        title = custom_prompt.split("\n")[0][:60] if custom_prompt else "Untitled"

    return {"novel_content": novel, "title": title}


async def _step_generate_chapters(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate each chapter of a long novel sequentially."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    outline = context.get("outline", {})
    chapters = outline.get("chapters", [])
    if not chapters:
        raise ValueError("No chapter outline found. Outline generation may have failed.")

    custom_prompt = input_params.get("custom_prompt", "")
    refs = context.get("references", [])
    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    # Build reference text once
    ref_text = ""
    if refs:
        ref_text = "\n".join(
            f"- {r['title']}: {r['summary'][:500]}" for r in refs
        )

    generated_chapters = []
    total = len(chapters)
    # Try to get task_id from context for checkpoint updates
    task_id_str = input_params.get("_task_id")

    for i, chapter_info in enumerate(chapters):
        title = chapter_info.get("title", f"Chapter {i+1}")
        description = chapter_info.get("description", "")

        system_prompt = (
            "You are a professional novelist. Write a compelling, detailed chapter "
            "for an original novel. The chapter should have vivid descriptions, "
            "natural dialogue, and engaging prose. Write in Chinese. "
            "Output the complete chapter in markdown format."
        )

        user_parts = [f"# User Instructions\n{custom_prompt}"]
        if ref_text:
            user_parts.append(f"# Reference Novels\n{ref_text}")
        user_parts.append(f"# Chapter {i+1} of {total}\nTitle: {title}\nDescription: {description}")

        # Add summaries of previous chapters for continuity
        if generated_chapters:
            prev_summary = "\n".join(
                f"- {c['title']}: {c['content'][:200]}..."
                for c in generated_chapters[-3:]
            )
            user_parts.append(f"# Previous Chapters Summary\n{prev_summary}")

        user_parts.append(f"\nWrite Chapter {i+1}: {title} now. Make it detailed and substantial (at least 800 words).")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n\n".join(user_parts)},
        ]

        chapter_content = await provider.chat(messages)
        generated_chapters.append({
            "title": title,
            "content": chapter_content,
        })

        # Update progress checkpoint after each chapter
        if task_id_str:
            try:
                progress = 50.0 + ((i + 1) / total) * 40.0  # 50% → 90%
                await _set_checkpoint(
                    UUID(task_id_str),
                    "RUNNING", progress, f"generate_chapters ({i+1}/{total})",
                    checkpoint={
                        **context,
                        "outline": outline,
                        "chapters_progress": generated_chapters,
                    },
                )
            except Exception:
                logger.warning("Failed to update chapter checkpoint", exc_info=True)

    # Merge all chapters into one full novel text
    full_novel = ""
    for i, ch in enumerate(generated_chapters):
        full_novel += f"# {ch['title']}\n\n{ch['content']}\n\n---\n\n"

    title = generated_chapters[0]["title"] if generated_chapters else input_params.get("custom_prompt", "Untitled").split("\n")[0][:60]

    return {
        "chapters": generated_chapters,
        "novel_content": full_novel,
        "title": title,
    }


async def _step_generate_script(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a script/screenplay from the novel content."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    novel = context.get("novel_content") or input_params.get("novel_content", "")
    if not novel:
        raise ValueError("No novel content provided for script generation")

    builder = ScriptPromptBuilder()
    messages = builder.build(
        novel_content=novel,
        title=input_params.get("title", ""),
        style=input_params.get("script_style", ""),
    )

    # Inject user's custom prompt as an additional instruction (e.g. novel-tweet-optimization style)
    user_prompt = input_params.get("prompt", "").strip()
    if user_prompt:
        messages.append({
            "role": "user",
            "content": (
                "# Additional Optimization Instructions\n\n"
                f"{user_prompt}\n\n"
                "Please apply the above optimization instructions when adapting the novel "
                "into the script. Make sure the script follows these requirements while "
                "maintaining proper screenplay format."
            ),
        })

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"script_content": content}


async def _step_generate_novel_tweet(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Step 1: Generate novel tweet from novel content.

    If novel_tweet_content is already provided in input_params (single-step
    mode for the video_tweet or storyboard tab), pass it through.
    """
    existing = input_params.get("novel_tweet_content") or context.get("novel_tweet_content")
    if existing:
        return {"novel_tweet_content": existing}

    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    novel = (
        input_params.get("novel_content")
        or context.get("novel_content")
        or ""
    )
    if not novel:
        raise ValueError("No novel content provided for novel tweet generation")

    user_prompt = input_params.get("novel_tweet_prompt", "").strip()
    if not user_prompt:
        user_prompt = input_params.get("prompt", "").strip()
    system_prompt = (
        "You are a professional novel tweet writer specializing in short-video "
        "content optimization. You excel at rewriting novel excerpts into engaging, "
        "viral short-video scripts that hook viewers in the first 3 seconds and "
        "keep them watching until the end."
    )
    if user_prompt:
        system_prompt = user_prompt

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "# Original Novel\n\n"
                f"{novel}\n\n"
                "Please optimize this novel excerpt into an engaging novel tweet script "
                "suitable for short-video platforms. Output in Chinese."
            ),
        },
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"novel_tweet_content": content}


async def _step_generate_video_tweet(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Step 2: Generate video tweet from novel tweet result.

    If video_tweet_content is already provided in input_params (single-step
    mode for the storyboard tab), pass it through.
    """
    existing = input_params.get("video_tweet_content") or context.get("video_tweet_content")
    if existing:
        return {"video_tweet_content": existing}

    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    novel_tweet = (
        input_params.get("novel_tweet_content")
        or context.get("novel_tweet_content")
        or ""
    )
    if not novel_tweet:
        raise ValueError("No novel tweet content provided for video tweet generation")

    user_prompt = input_params.get("video_tweet_prompt", "").strip()
    system_prompt = (
        "You are a professional video tweet creator. You specialize in adapting "
        "novel tweet content into engaging video scripts optimized for short-video "
        "platforms."
    )
    if user_prompt:
        system_prompt = user_prompt

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "# Original Novel Tweet\n\n"
                f"{novel_tweet}\n\n"
                "Please adapt this novel tweet into a video tweet script format "
                "optimized for short-video platforms. Output in Chinese."
            ),
        },
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"video_tweet_content": content}


async def _step_generate_storyboard(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Step 3: Generate storyboard from video tweet result."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    video_tweet = (
        input_params.get("video_tweet_content")
        or context.get("video_tweet_content")
        or ""
    )
    if not video_tweet:
        raise ValueError("No video tweet content provided for storyboard generation")

    user_prompt = input_params.get("storyboard_prompt", "").strip()
    system_prompt = (
        "You are a professional screenwriter and director skilled at converting "
        "video scripts into detailed storyboard scripts for AI video generation."
    )
    if user_prompt:
        system_prompt = user_prompt

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "# Video Tweet Script\n\n"
                f"{video_tweet}\n\n"
                "Please convert this video tweet script into a detailed storyboard "
                "for AI video generation. Output in Chinese."
            ),
        },
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"storyboard_content": content}


async def _step_generate_lyrics(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate lyrics via the LLM provider."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    builder = LyricsPromptBuilder()
    messages = builder.build(
        theme=input_params.get("theme", "Untitled"),
        genre=input_params.get("genre", "pop"),
        structure=input_params.get("structure", "verse-chorus-verse-chorus-bridge-chorus"),
        mood=input_params.get("mood", ""),
        language=input_params.get("language", "Chinese"),
    )

    refs = context.get("references", [])
    if refs:
        ref_text = "\n\nReference context:\n" + "\n".join(
            f"- {r['title']}: {r['summary'][:200]}" for r in refs
        )
        messages[1]["content"] += ref_text

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"lyrics_content": content}


async def _step_generate_song(input_params: dict, context: dict) -> dict:
    """Generate a song / audio from lyrics.  Placeholder for TTS/MusicGen."""
    lyrics = context.get("lyrics_content", "")
    if not lyrics:
        raise ValueError("No lyrics content provided for song generation")

    # TODO: Replace with actual TTS or music-generation API call.
    return {
        "song_placeholder": True,
        "lyrics_length": len(lyrics),
        "message": "Song generation not yet wired to a TTS/music service. "
        "Lyrics are available for downstream processing.",
    }


async def _step_generate_image(input_params: dict, context: dict) -> dict:
    """Generate an image from the lyrics/script context. Placeholder."""
    # TODO: Replace with actual image-generation API call (e.g. DALL-E, Stable Diffusion).
    return {
        "image_placeholder": True,
        "message": "Image generation not yet wired to an image service. "
        "Prior step outputs are available for downstream processing.",
    }


async def _step_generate_video(input_params: dict, context: dict) -> dict:
    """Generate a video from novel + song.  Placeholder for video-gen service."""
    # TODO: Replace with actual video-generation API call.
    return {
        "video_placeholder": True,
        "message": "Video generation not yet wired to a video service. "
        "All prior step outputs are available.",
    }


# ── Step registry ─────────────────────────────────────────────────────

_STEP_REGISTRY = {
    "search_reference_novels": _step_search_references,
    "generate_novel": _step_generate_novel,
    "generate_novel_by_chapters": _step_generate_novel_by_chapters,
    "generate_outline": _step_generate_outline,
    "generate_volume_outline": _step_generate_volume_outline,
    "generate_character_rules": _step_generate_character_rules,
    "generate_chapters": _step_generate_chapters,
    "generate_script": _step_generate_script,
    "generate_novel_tweet": _step_generate_novel_tweet,
    "generate_video_tweet": _step_generate_video_tweet,
    "generate_storyboard": _step_generate_storyboard,
    "generate_lyrics": _step_generate_lyrics,
    "generate_song": _step_generate_song,
    "generate_image": _step_generate_image,
    "generate_video": _step_generate_video,
}

_STEP_WEIGHTS = {
    "search_reference_novels": 5.0,
    "generate_novel": 20.0,
    "generate_novel_by_chapters": 50.0,
    "generate_outline": 10.0,
    "generate_volume_outline": 15.0,
    "generate_character_rules": 10.0,
    "generate_chapters": 50.0,
    "generate_script": 10.0,
    "generate_novel_tweet": 10.0,
    "generate_video_tweet": 10.0,
    "generate_storyboard": 10.0,
    "generate_lyrics": 15.0,
    "generate_song": 10.0,
    "generate_image": 5.0,
    "generate_video": 5.0,
}

# ── Workflow definitions ──────────────────────────────────────────────

_WORKFLOWS: dict[str, list[str]] = {
    "generate_novel": ["search_reference_novels", "generate_novel"],
    "generate_long_novel": ["search_reference_novels", "generate_outline", "generate_chapters"],
    "generate_outline_only": ["search_reference_novels", "generate_outline"],
    "generate_volume_outline_only": ["search_reference_novels", "generate_outline", "generate_volume_outline"],
    "generate_character_rules_only": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_character_rules"],
    "generate_novel_with_outline": ["search_reference_novels", "generate_novel"],
    "generate_novel_with_volume_outline": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_novel"],
    "generate_novel_with_character_rules": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_character_rules", "generate_novel_by_chapters"],
    "generate_script": ["generate_novel", "generate_novel_tweet", "generate_video_tweet", "generate_storyboard"],
    "generate_novel_tweet": ["generate_novel", "generate_novel_tweet"],
    "generate_video_tweet": ["generate_novel_tweet", "generate_video_tweet"],
    "generate_storyboard": ["generate_video_tweet", "generate_storyboard"],
    "generate_lyrics": ["search_reference_novels", "generate_lyrics"],
    "generate_song": ["generate_lyrics", "generate_song"],
    "generate_image": ["generate_song", "generate_image"],
    "generate_video": [
        "search_reference_novels",
        "generate_novel",
        "generate_script",
        "generate_lyrics",
        "generate_song",
        "generate_image",
        "generate_video",
    ],
}


# ── Workflow engine (async core) ─────────────────────────────────────

# Celery on Windows with --pool=solo shares the main event loop.
# We create a fresh engine + session inside _run_workflow so that all
# asyncpg connections live on a private event loop.


async def _run_workflow_async(
    task_id: str, user_id: str, steps: list[str], input_params: dict,
    session: AsyncSession,
) -> dict:
    """Async workflow engine.  Requires a session from the caller."""
    task_uuid = UUID(task_id)
    user_uuid = UUID(user_id)
    task_data = await _get_task(task_uuid, session)
    if task_data is None:
        raise ValueError(f"Task {task_id} not found")
    if task_data["status"] == "SUCCESS" and task_data.get("result"):
        return task_data["result"]
    if task_data["status"] == "FAILED" and task_data.get("result"):
        return task_data["result"]

    checkpoint = task_data["checkpoint_data"] or {}
    completed_steps = set(checkpoint.get("completed_steps", set()))
    context: dict[str, Any] = checkpoint.get("context", {})
    total_weight = sum(_STEP_WEIGHTS[s] for s in steps)
    completed_weight = checkpoint.get("completed_weight", 0.0)

    # Mark RUNNING
    await _set_checkpoint(task_uuid, "RUNNING", task_data["progress"], steps[0] if steps else "", session=session)

    for step_name in steps:
        if step_name in completed_steps:
            logger.info("Resuming: skipping completed step '%s'", step_name)
            continue

        step_fn = _STEP_REGISTRY[step_name]
        step_weight = _STEP_WEIGHTS[step_name]
        progress = min((completed_weight / total_weight) * 100, 99.0)

        try:
            await _set_checkpoint(
                task_uuid, "RUNNING", progress, step_name,
                checkpoint={**checkpoint, "context": context},
                session=session,
            )

            # Execute the step — inject session for steps that need DB access
            step_result = await step_fn({**input_params, "_session": session, "_checkpoint_data": {**checkpoint, "context": context}}, context, user_id=user_uuid)
            context.update(step_result)

            # Update checkpoint after successful step
            completed_weight += step_weight
            completed_steps.add(step_name)
            checkpoint = {
                "completed_steps": list(completed_steps),
                "completed_weight": completed_weight,
                "context": context,
            }

            progress = min((completed_weight / total_weight) * 100, 99.0)
            await _set_checkpoint(
                task_uuid, "RUNNING", progress, step_name,
                checkpoint=checkpoint,
                session=session,
            )

        except Exception as exc:
            logger.exception("Step '%s' failed for task %s", step_name, task_id)
            await _set_checkpoint(
                task_uuid, "FAILED", progress, step_name,
                error=f"Step '{step_name}' failed: {exc}",
                checkpoint=checkpoint,
                session=session,
            )
            raise

    # SUCCESS
    await _set_checkpoint(
        task_uuid, "SUCCESS", 100.0, steps[-1],
        checkpoint=checkpoint,
        result=context,
        session=session,
    )
    return context


def _run_workflow(task_id: str, user_id: str, steps: list[str], input_params: dict) -> dict:
    """Sync wrapper — uses asyncio.run() to isolate Celery's event loop."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    async def _run_with_cleanup():
        # Create a fresh engine inside the coroutine so it lives on the
        # same loop as everything else (httpx, asyncpg, etc.)
        engine = create_async_engine(
            settings.database_url,
            echo=settings.debug,
            pool_size=2,
            max_overflow=4,
            pool_pre_ping=True,
        )
        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        session = session_factory()
        try:
            return await _run_workflow_async(task_id, user_id, steps, input_params, session)
        finally:
            await session.close()
            await engine.dispose()

    return asyncio.run(_run_with_cleanup())


# ── Celery tasks ──────────────────────────────────────────────────────


@celery_app.task(
    name="workflow_generate_novel",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_novel(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search reference novels → generate novel."""
    steps = _WORKFLOWS["generate_novel"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_long_novel",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_long_novel(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate outline → generate chapters (long novel)."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_long_novel"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_lyrics",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_lyrics(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search reference novels → generate lyrics."""
    steps = _WORKFLOWS["generate_lyrics"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_song",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_song(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: generate lyrics → generate song."""
    steps = _WORKFLOWS["generate_song"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_video",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_video(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Full pipeline: search refs → novel → script → lyrics → song → image → video."""
    steps = _WORKFLOWS["generate_video"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_tweet",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_novel_tweet(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel → generate novel_tweet."""
    steps = _WORKFLOWS["generate_novel_tweet"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_video_tweet",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_video_tweet(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel_tweet → generate video_tweet."""
    steps = _WORKFLOWS["generate_video_tweet"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_storyboard",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_storyboard(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate video_tweet → generate storyboard."""
    steps = _WORKFLOWS["generate_storyboard"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_script",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_script(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: generate novel → generate script."""
    steps = _WORKFLOWS["generate_script"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_image",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_image(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: generate song → generate image."""
    steps = _WORKFLOWS["generate_image"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_outline_only",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_outline_only(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate outline only."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_outline_only"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_with_outline",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_novel_with_outline(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate novel (outline in input_params)."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel_with_outline"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_volume_outline_only",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_volume_outline_only(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate outline → generate volume outline."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_volume_outline_only"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_with_volume_outline",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_novel_with_volume_outline(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate outline → generate volume outline → generate novel."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel_with_volume_outline"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_character_rules_only",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_character_rules_only(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → outline → volume outline → character rules."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_character_rules_only"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_with_character_rules",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def workflow_generate_novel_with_character_rules(self, task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → outline → volume outline → character rules → generate novel."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel_with_character_rules"]
    return _run_workflow(task_id, user_id, steps, input_params)

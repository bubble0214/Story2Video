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
    """Generate full novel content via LLM.

    If novel_content is already provided in input_params (e.g. user uploaded
    a .txt file on the frontend), pass it through without calling the LLM.
    """
    # Passthrough: user-supplied novel content
    existing = input_params.get("novel_content") or context.get("novel_content")
    if existing and existing.strip():
        logger.info("_step_generate_novel passthrough (%d chars)", len(existing))
        return {"novel_content": existing.strip()}
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    custom_prompt = input_params.get("custom_prompt", "")
    refs = context.get("references", [])
    outline = context.get("outline_text") or input_params.get("outline_text", "")
    volume_outline = context.get("volume_outline_text") or input_params.get("volume_outline_text", "")
    character_rules = context.get("character_rules_text") or input_params.get("character_rules_text", "")
    task_id = input_params.get("_task_id")
    session = input_params.get("_session")

    logger.info("_step_generate_novel refs=%d outline=%d", len(refs), len(outline))

    builder = NovelPromptBuilder()
    messages = builder.build(
        custom_prompt=custom_prompt,
        references=refs,
        outline_text=outline,
        volume_outline_text=volume_outline,
        character_rules_text=character_rules,
    )

    if task_id and session:
        await _set_checkpoint(
            UUID(task_id), "RUNNING", 50.0, "novel: generating with AI",
            checkpoint=input_params.get("_checkpoint_data"),
            session=session,
        )

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    content = await provider.chat(messages)
    return {"novel_content": content.strip()}


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

    logger.info("_step_generate_outline refs count === %s", len(refs))

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


async def _step_generate_script(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a script/screenplay by generating each scene one by one.

    When ``interactive`` is true and pre-generated scenes are provided,
    skip LLM generation and compose the result from the provided content.
    """
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    # Interactive finalize path: scenes were already generated in the frontend
    if input_params.get("interactive"):
        script_content = input_params.get("script_content", "")
        generated_scenes = input_params.get("generated_scenes", {})
        if script_content or generated_scenes:
            scenes_list = [
                {"num": str(k), "content": v}
                for k, v in generated_scenes.items()
                if v
            ] if generated_scenes else []
            return {
                "script_content": script_content,
                "generated_scenes": scenes_list,
                "title": input_params.get("script_title", "未命名剧本"),
            }

    novel = context.get("novel_content") or input_params.get("novel_content", "")
    if not novel:
        raise ValueError("No novel content provided for script generation")

    character_prompt = input_params.get("character_setting_prompt", "").strip()
    analysis = context.get("novel_analysis") or input_params.get("novel_analysis", "")
    chosen = input_params.get("chosen_structure", "")
    struct = input_params.get("structure_content", "")
    scene_outline = context.get("scene_outline_content") or input_params.get("scene_outline_content", "")

    if not scene_outline:
        raise ValueError("Scene outline is required for scene-by-scene generation")

    # Parse scenes from the outline — split by --- separator
    raw_scenes = re.split(r'\n?-{3,}\n?', scene_outline)
    scenes: list[dict] = []
    for raw in raw_scenes:
        raw = raw.strip()
        if not raw:
            continue
        # Extract key fields
        scene_num = ""
        location = ""
        summary = ""
        characters = ""

        for line in raw.split("\n"):
            line_lower = line.strip().lower()
            if line_lower.startswith("场号") or line_lower.startswith("场次"):
                scene_num = line.split("：", 1)[-1].strip() if "：" in line else line.split(":", 1)[-1].strip()
            elif line_lower.startswith("内外景") or line_lower.startswith("场景"):
                pass
            elif line_lower.startswith("地点"):
                loc_val = line.split("：", 1)[-1].strip() if "：" in line else line.split(":", 1)[-1].strip()
                if loc_val:
                    location = loc_val
            elif line_lower.startswith("时间"):
                time_val = line.split("：", 1)[-1].strip() if "：" in line else line.split(":", 1)[-1].strip()
                if time_val:
                    location = f"{location} - {time_val}" if location else time_val
            elif line_lower.startswith("梗概"):
                summary = line.split("：", 1)[-1].strip() if "：" in line else line.split(":", 1)[-1].strip()
            elif line_lower.startswith("人物"):
                characters = line.split("：", 1)[-1].strip() if "：" in line else line.split(":", 1)[-1].strip()

        if scene_num or summary:
            scenes.append({
                "raw": raw,
                "num": scene_num,
                "location": location,
                "summary": summary,
                "characters": characters,
            })

    if not scenes:
        # Fallback: treat the entire outline as a single section
        scenes = [{"raw": scene_outline, "num": "1", "location": "", "summary": "", "characters": ""}]

    logger.info("Scene-by-scene generation: %d scenes parsed", len(scenes))

    # Resolve LLM once
    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    # Build base system messages (shared across all scene generations)
    base_system_messages: list[dict] = []
    if character_prompt:
        base_system_messages.append({"role": "system", "content": character_prompt})

    base_system_messages.append({
        "role": "system",
        "content": (
            "你现在是一位专业电影编剧。请根据分场大纲，逐场撰写完整剧本。\n\n"
            "严格遵循电影剧本格式：\n"
            "- 场景标题：场号. 内/外景 - 地点 - 时间（如：5. 内景 - 林家客厅 - 夜）\n"
            "- 动作描述：以视觉化、现在时态描述画面，每段不超过4行\n"
            "- 对白：人物名在上，对白在下，不添加引号\n"
            "- 人物首次出场需大写并附简要描述\n"
            "- 转场：注明'切至：'或'淡出'\n\n"
            "风格要求：动作描写要有画面感和节奏感，台词要贴合人物设定，潜台词丰富。\n"
            "请直接输出剧本内容，无需额外说明。"
        ),
    })
    if analysis:
        base_system_messages.append({"role": "assistant", "content": f"[核心要素分析参考]\n{analysis}"})

    # Build shared context for the user message (novel + structure info)
    context_parts = [f"# 原创小说\n\n{novel}"]
    if chosen and struct:
        context_parts.append(
            f"# 用户选定的剧本结构方案\n\n"
            f"用户选择了方案{chosen}，请严格按照此结构进行剧本创作：\n\n{struct}"
        )
    user_prompt_extra = input_params.get("prompt", "").strip()
    if user_prompt_extra:
        context_parts.append(
            f"# Additional Optimization Instructions\n\n{user_prompt_extra}"
        )
    shared_context = "\n\n".join(context_parts)

    # Generate scene by scene
    total = len(scenes)
    full_script_parts: list[str] = []
    accumulated_script = ""  # fed back as context so the LLM stays consistent
    _task_id = input_params.get("_task_id", "")
    _session = input_params.get("_session")
    _checkpoint = input_params.get("_checkpoint_data", {})

    for idx, scene in enumerate(scenes):
        scene_num = scene["num"] or str(idx + 1)
        logger.info("Generating scene %s/%s (场号: %s)", idx + 1, total, scene_num)

        # Update checkpoint to show progress
        if _task_id and _session:
            scene_progress = 10.0 + ((idx + 1) / total) * 80.0  # 10% → 90%
            await _set_checkpoint(
                UUID(_task_id), "RUNNING", scene_progress,
                f"script: 第{scene_num}场/{total}场",
                checkpoint=_checkpoint,
                session=_session,
            )

        # Build messages for this scene
        msgs = list(base_system_messages)

        # Include previous script as context (last 2 scenes to stay within token limits)
        if accumulated_script:
            # Keep roughly the last 2 scenes
            prev_scenes = full_script_parts[-2:] if len(full_script_parts) >= 2 else full_script_parts
            prev_text = "\n\n".join(prev_scenes)
            msgs.append({
                "role": "assistant",
                "content": f"[已生成的前续剧本，供保持连贯性参考]\n\n{prev_text}",
            })

        # Scene-specific instruction
        scene_instruction = (
            f"{shared_context}\n\n"
            f"# 当前场次\n\n"
            f"请撰写以下这一场戏的剧本内容：\n\n"
            f"场号：{scene_num}\n"
            f"{'地点：' + scene['location'] if scene['location'] else ''}\n"
            f"{'梗概：' + scene['summary'] if scene['summary'] else ''}\n"
            f"{'人物：' + scene['characters'] if scene['characters'] else ''}\n\n"
            f"原始大纲参考：\n{scene['raw']}\n\n"
            f"# 要求\n\n"
            f"1. 只输出当前这场戏的剧本内容\n"
            f"2. 严格按照格式：场号. 内/外景 - 地点 - 时间\n"
            f"3. 动作描述以视觉化、现在时态，每段不超过4行\n"
            f"4. 对白：人物名在上，对白在下\n"
            f"5. 人物首次出场需大写并附简要描述\n"
            f"6. 与前序场景在人物、时间线上保持连贯"
        )
        msgs.append({"role": "user", "content": scene_instruction})

        scene_content = await provider.chat(msgs)
        scene_content = scene_content.strip()

        full_script_parts.append(scene_content)
        accumulated_script = "\n\n".join(full_script_parts)

        # Log progress
        logger.info("Scene %s/%s generated (%d chars)", idx + 1, total, len(scene_content))

    complete_script = "\n\n".join(full_script_parts)
    return {"script_content": complete_script}


async def _step_generate_single_scene(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a single scene based on scene index (interactive mode)."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    scene_index = input_params.get("scene_index")
    if scene_index is None:
        raise ValueError("scene_index is required")
    scene_raw = input_params.get("scene_raw", "")
    if not scene_raw:
        scene_raw = (
            f"场号：{input_params.get('scene_num', scene_index + 1)}\n"
            f"地点：{input_params.get('scene_location', '')}\n"
            f"梗概：{input_params.get('scene_summary', '')}\n"
            f"人物：{input_params.get('scene_characters', '')}"
        )

    scene_num = input_params.get("scene_num") or str(scene_index + 1)
    location = input_params.get("scene_location", "")
    summary = input_params.get("scene_summary", "")
    characters = input_params.get("scene_characters", "")
    accumulated_context = input_params.get("accumulated_context", "")
    total_scenes = input_params.get("total_scenes", 0)

    novel = context.get("novel_content") or input_params.get("novel_content", "")
    character_prompt = input_params.get("character_setting_prompt", "").strip()
    analysis = context.get("novel_analysis") or input_params.get("novel_analysis", "")
    chosen = input_params.get("chosen_structure", "")
    struct = input_params.get("structure_content", "")

    # Resolve LLM
    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    # Build system messages (same style as _step_generate_script)
    messages: list[dict] = []
    if character_prompt:
        messages.append({"role": "system", "content": character_prompt})

    messages.append({
        "role": "system",
        "content": (
            "你现在是一位专业电影编剧。请根据分场大纲，逐场撰写完整剧本。\n\n"
            "严格遵循电影剧本格式：\n"
            "- 场景标题：场号. 内/外景 - 地点 - 时间（如：5. 内景 - 林家客厅 - 夜）\n"
            "- 动作描述：以视觉化、现在时态描述画面，每段不超过4行\n"
            "- 对白：人物名在上，对白在下，不添加引号\n"
            "- 人物首次出场需大写并附简要描述\n"
            "- 转场：注明'切至：'或'淡出'\n\n"
            "风格要求：动作描写要有画面感和节奏感，台词要贴合人物设定，潜台词丰富。\n"
            "请直接输出剧本内容，无需额外说明。"
        ),
    })
    if analysis:
        messages.append({"role": "assistant", "content": f"[核心要素分析参考]\n{analysis}"})

    # Build context
    context_parts = []
    if novel:
        context_parts.append(f"# 原创小说\n\n{novel}")
    if chosen and struct:
        context_parts.append(
            f"# 用户选定的剧本结构方案\n\n"
            f"用户选择了方案{chosen}，请严格按照此结构进行剧本创作：\n\n{struct}"
        )
    user_prompt_extra = input_params.get("prompt", "").strip()
    if user_prompt_extra:
        context_parts.append(f"# Additional Optimization Instructions\n\n{user_prompt_extra}")
    shared_context = "\n\n".join(context_parts)

    # Include previous script as context (last 2 scenes)
    if accumulated_context:
        messages.append({
            "role": "assistant",
            "content": f"[已生成的前续剧本，供保持连贯性参考]\n\n{accumulated_context}",
        })

    # Scene-specific instruction — strongly emphasize single-scene output
    scene_instruction = (
        f"{shared_context}\n\n"
        f"# 当前场次（第{scene_num}场/共{total_scenes}场）\n\n"
        f"请只撰写以下这一场戏的剧本内容。只输出这一场，不要输出其他场次的内容。\n"
        f"注意：严禁在输出中包含下一场或任何其他场次的剧本。\n\n"
        f"场号：{scene_num}\n"
    )
    if location:
        scene_instruction += f"地点：{location}\n"
    if characters:
        scene_instruction += f"人物：{characters}\n"
    if summary:
        scene_instruction += f"梗概：{summary}\n"
    scene_instruction += f"\n原始大纲：\n{scene_raw}"

    messages.append({"role": "user", "content": scene_instruction})

    content = await provider.chat(messages)
    stripped = content.strip()
    if not stripped:
        raise ValueError("LLM returned empty content for scene — generation failed")

    return {"scene_content": stripped, "scene_index": scene_index}


async def _step_scene_diagnosis(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Diagnose the last 10 scenes and return diagnosis + modified scenes."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    scenes_text = context.get("scenes_text") or input_params.get("scenes_text", "")
    if not scenes_text:
        raise ValueError("No scenes text provided for diagnosis")

    messages: list[dict] = [
        {
            "role": "system",
            "content": "你现在是一位资深剧本医生（Script Doctor），擅长对电影剧本进行专业诊断并给出修改方案。你的诊断必须直击要害、可操作。",
        },
        {
            "role": "user",
            "content": (
                "# 待诊断剧本（最近10场）\n\n"
                f"{scenes_text}\n\n"
                "# 诊断任务\n\n"
                "请对以上剧本进行全面诊断，包括以下四个方面：\n\n"
                "## 1. 节奏诊断\n"
                "指出节奏拖沓的场景，并提供两种删减或合并的思路。\n\n"
                "## 2. 台词诊断\n"
                "检验每句台词是否具有'动作性'（即是否能推动剧情或体现人物），标记出纯粹解释性的话语。\n\n"
                "## 3. 人物弧光检查\n"
                "检查主角从开头到结尾是否发生了根本性变化？缺少哪些转折点场景？\n\n"
                "## 4. 视觉重复性检查\n"
                "检查是否存在太多同类型的场景（如太多车内对话）？请给出替换建议。\n\n"
                "请按以上四个部分输出诊断结果，每部分先给出总体判断，再列出具体问题点和修改建议。\n\n"
                "## 修改方案\n\n"
                "在诊断结束后，对于需要修改的场景，请输出修改后的版本。"
                "格式：\n## 修改场景 X\n\n[修改后的完整剧本内容]\n\n"
                "只输出确实需要修改的场景，无需修改的场景不要输出。"
            ),
        },
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)

    # Parse modified scenes from the output
    modified_scenes: dict[str, str] = {}
    diagnosis_parts: list[str] = []
    current_section: str | None = None
    current_lines: list[str] = []

    for line in content.split("\n"):
        modified_match = re.match(r"^## 修改场景\s+(\d+)", line.strip())
        if modified_match:
            if current_section == "diagnosis" and current_lines:
                diagnosis_parts.extend(current_lines)
            elif current_section and current_section.startswith("modified_scene_") and current_lines:
                modified_scenes[current_section.split("_", 2)[2]] = "\n".join(current_lines)
            current_section = f"modified_scene_{modified_match.group(1)}"
            current_lines = [line]
        elif line.strip().startswith("## 修改方案") or line.strip().startswith("## 修改场景"):
            if current_section == "diagnosis" and current_lines:
                diagnosis_parts.extend(current_lines)
            elif current_section and current_section.startswith("modified_scene_") and current_lines:
                modified_scenes[current_section.split("_", 2)[2]] = "\n".join(current_lines)
            current_section = "diagnosis" if line.strip().startswith("## 修改方案") else current_section
            current_lines = [line]
        else:
            if current_section is None:
                current_section = "diagnosis"
            current_lines.append(line)

    # Flush last section
    if current_section == "diagnosis" and current_lines:
        diagnosis_parts.extend(current_lines)
    elif current_section and current_section.startswith("modified_scene_") and current_lines:
        modified_scenes[current_section.split("_", 2)[2]] = "\n".join(current_lines)

    diagnosis_text = "\n".join(diagnosis_parts)
    return {
        "script_diagnosis": diagnosis_text.strip(),
        "modified_scenes": modified_scenes,
    }


async def _step_diagnose_script(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Diagnose the generated script as a script doctor."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    script = context.get("script_content") or input_params.get("script_content", "")
    if not script:
        raise ValueError("No script content provided for diagnosis")

    messages: list[dict] = [
        {
            "role": "system",
            "content": "你现在是一位资深剧本医生（Script Doctor），擅长对电影剧本进行专业诊断并给出修改方案。你的诊断必须直击要害、可操作。",
        },
        {
            "role": "user",
            "content": (
                "# 待诊断剧本\n\n"
                f"{script}\n\n"
                "# 诊断任务\n\n"
                "请对以上剧本进行全面诊断，包括以下四个方面：\n\n"
                "## 1. 节奏诊断\n"
                "指出节奏拖沓的场景，并提供两种删减或合并的思路。\n\n"
                "## 2. 台词诊断\n"
                "检验每句台词是否具有'动作性'（即是否能推动剧情或体现人物），标记出纯粹解释性的话语。\n\n"
                "## 3. 人物弧光检查\n"
                "检查主角从开头到结尾是否发生了根本性变化？缺少哪些转折点场景？\n\n"
                "## 4. 视觉重复性检查\n"
                "检查是否存在太多同类型的场景（如太多车内对话）？请给出替换建议。\n\n"
                "请按以上四个部分输出诊断结果，每部分先给出总体判断，再列出具体问题点和修改建议。"
            ),
        },
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"script_diagnosis": content.strip()}


async def _step_analyze_novel(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Analyze novel content to extract core elements for screenwriting.

    Takes the novel + character role settings and produces:
    - Logline (one-sentence core story)
    - Character profiles (dramatic desire + fatal flaw)
    - Top 3-5 must-keep iconic scenes
    - Suggestions for non-visualizable elements
    """
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    # Passthrough: pre-existing analysis (interactive mode)
    existing = input_params.get("novel_analysis") or context.get("novel_analysis")
    if existing and existing.strip():
        logger.info("_step_analyze_novel passthrough (%d chars)", len(existing))
        return {"novel_analysis": existing.strip()}

    novel = context.get("novel_content") or input_params.get("novel_content", "")
    if not novel:
        raise ValueError("No novel content provided for analysis")

    character_prompt = input_params.get("character_setting_prompt", "").strip()

    messages: list[dict] = []

    # Role setting as system prompt
    if character_prompt:
        messages.append({"role": "system", "content": character_prompt})
    else:
        messages.append({
            "role": "system",
            "content": "你现在是一位资深影视编剧，擅长将文学作品转化为视觉性极强的电影剧本。",
        })

    # User prompt: analysis task
    analysis_prompt = (
        "请仔细阅读以上小说章节。作为编剧，请你完成以下分析：\n\n"
        "1. 用一段话概括核心故事（一句话梗概Logline）。\n\n"
        "2. 列出主要人物小传（每人一句话，标明其戏剧性欲望和致命缺陷）。\n\n"
        "3. 标出3-5个最震撼、必须保留的'名场面'。\n\n"
        "4. 指出原著中可能不适合影视化呈现的部分（如大量内心独白），并给出改编建议。"
    )

    user_content = f"# Original Novel\n\n{novel}\n\n# Analysis Task\n\n{analysis_prompt}"
    messages.append({"role": "user", "content": user_content})

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"novel_analysis": content.strip()}


async def _step_generate_structure(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate two structural options (3-act and Blake Snyder Beat Sheet)."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    # Passthrough: pre-existing structure (interactive mode)
    existing = input_params.get("structure_content") or context.get("structure_content")
    if existing and existing.strip():
        logger.info("_step_generate_structure passthrough (%d chars)", len(existing))
        return {"structure_content": existing.strip()}

    novel = context.get("novel_content") or input_params.get("novel_content", "")
    if not novel:
        raise ValueError("No novel content provided for structure generation")

    analysis = context.get("novel_analysis") or input_params.get("novel_analysis", "")
    character_prompt = input_params.get("character_setting_prompt", "").strip()

    messages: list[dict] = []

    if character_prompt:
        messages.append({"role": "system", "content": character_prompt})
    else:
        messages.append({
            "role": "system",
            "content": "你现在是一位资深编剧顾问，擅长为小说改编剧本设计故事结构。",
        })

    analysis_section = ""
    if analysis:
        analysis_section = f"# 核心要素分析（供参考）\n\n{analysis}\n\n"

    user_prompt = (
        "请根据以下小说内容和核心要素分析，提供两套剧本结构方案。\n\n"
        f"{analysis_section}"
        "# 原创小说\n\n"
        f"{novel}\n\n"
        "# 结构设计任务\n\n"
        "请设计以下两种结构方案：\n\n"
        "**方案A：经典三幕剧结构**\n"
        "请按以下格式输出：\n"
        "| 幕 | 关键情节点 | 对应小说内容 | 高概念看点 |\n"
        "|----|----------|------------|----------|\n"
        "第一幕（建置） | 激励事件、第一幕转折点 | ... | ... |\n"
        "第二幕（对抗） | 中点转折、一无所有时刻 | ... | ... |\n"
        "第三幕（解决） | 高潮、结局 | ... | ... |\n\n"
        "**方案B：Blake Snyder Beat Sheet 15节拍表**\n"
        "请按以下格式输出（15个节拍）：\n"
        "| 编号 | 节拍名称 | 页码位置 | 对应小说内容 | 高概念看点 |\n"
        "|-----|---------|---------|------------|----------|\n"
        "1 | 开场画面 | 第1页 | ... | ... |\n"
        "2 | 主题呈现 | 第5页 | ... | ... |\n"
        "...（共15个节拍，完整列出）...\n\n"
        "要求：\n"
        "1. 每个方案都要标注明确的\"高概念看点\"列，突出市场卖点\n"
        "2. 方案A需标注每个情节点对应的小说原文位置或情节\n"
        "3. 方案B需完整列出全部15个节拍，不可省略\n"
        "4. 两种方案都要给出总体评价（适合什么类型的观众、独特优势）\n"
        "5. 使用清晰的中文表格格式，便于阅读"
    )
    messages.append({"role": "user", "content": user_prompt})

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"structure_content": content.strip()}


async def _step_generate_scene_outline(
    input_params: dict, context: dict, user_id: UUID | None = None,
) -> dict:
    """Generate a detailed scene-by-scene outline based on chosen structure."""
    if user_id is None:
        raise ValueError("User ID required to resolve LLM API key")

    # Passthrough: pre-existing scene outline (interactive mode)
    existing = input_params.get("scene_outline_content") or context.get("scene_outline_content")
    if existing and existing.strip():
        logger.info("_step_generate_scene_outline passthrough (%d chars)", len(existing))
        return {"scene_outline_content": existing.strip()}

    novel = context.get("novel_content") or input_params.get("novel_content", "")
    if not novel:
        raise ValueError("No novel content provided for scene outline generation")

    analysis = context.get("novel_analysis") or input_params.get("novel_analysis", "")
    structure = context.get("structure_content") or input_params.get("structure_content", "")
    chosen = context.get("chosen_structure") or input_params.get("chosen_structure", "")
    character_prompt = input_params.get("character_setting_prompt", "").strip()

    if not structure or not chosen:
        raise ValueError("Structure content and chosen structure required for scene outline generation")

    messages: list[dict] = []
    if character_prompt:
        messages.append({"role": "system", "content": character_prompt})
    else:
        messages.append({
            "role": "system",
            "content": "你现在是一位资深影视编剧兼导演，擅长将剧本结构转化为详细的分场大纲。",
        })

    analysis_section = ""
    if analysis:
        analysis_section = f"# 核心要素分析（供参考）\n\n{analysis}\n\n"

    user_prompt = (
        "请根据以下小说内容和选定的剧本结构方案，写一份详细的分场大纲。\n\n"
        f"{analysis_section}"
        "# 原创小说\n\n"
        f"{novel}\n\n"
        f"# 用户选定的结构方案（方案{chosen}）\n\n"
        f"{structure}\n\n"
        "# 分场大纲设计任务\n\n"
        "我选择方案{chosen}的结构。现在请根据这个结构，写一份详细的分场大纲。\n\n"
        "要求：\n"
        "1. 严格按场景（Scene）列出，每场包含：场号、内外景、地点、时间、一句话剧情梗概、出场人物。\n\n"
        "2. 重点突出视觉化呈现，避免任何依赖内心独白的戏。\n\n"
        "3. 将原著超过3页的对话压缩为戏剧冲突更强的台词。\n\n"
        "4. 删减次要人物或支线，如有必要，将其功能合并到其他场景中。\n\n"
        "5. 全片大纲控制在40-60场左右。\n\n"
        "请严格使用以下格式输出每场，不要添加额外格式：\n"
        "---\n"
        "场号：1\n"
        "内外景：内景\n"
        "地点：具体地点\n"
        "时间：日/夜\n"
        "梗概：一句话概括本场发生什么\n"
        "人物：出场人物列表\n"
        "---\n"
        "不要使用'剧情梗概'或其他变体，key统一为：场号、内外景、地点、时间、梗概、人物。每场以 --- 分隔。"
    )
    messages.append({"role": "user", "content": user_prompt})

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"scene_outline_content": content.strip()}


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
    "generate_outline": _step_generate_outline,
    "generate_volume_outline": _step_generate_volume_outline,
    "generate_character_rules": _step_generate_character_rules,
    "generate_script": _step_generate_script,
    "generate_single_scene": _step_generate_single_scene,
    "generate_scene_diagnosis": _step_scene_diagnosis,
    "generate_analyze_novel": _step_analyze_novel,
    "generate_script_structure": _step_generate_structure,
    "generate_scene_outline": _step_generate_scene_outline,
    "generate_script_diagnosis": _step_diagnose_script,
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
    "generate_outline": 10.0,
    "generate_volume_outline": 15.0,
    "generate_character_rules": 10.0,
    "generate_analyze_novel": 15.0,
    "generate_script_structure": 10.0,
    "generate_scene_outline": 15.0,
    "generate_script": 10.0,
    "generate_single_scene": 5.0,
    "generate_scene_diagnosis": 10.0,
    "generate_script_diagnosis": 10.0,
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
    "generate_novel_with_outline": ["search_reference_novels", "generate_outline", "generate_novel"],
    "generate_novel_with_volume_outline": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_novel"],
    "generate_novel_with_character_rules": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_character_rules", "generate_novel"],
    "generate_outline_only": ["search_reference_novels", "generate_outline"],
    "generate_volume_outline_only": ["search_reference_novels", "generate_outline", "generate_volume_outline"],
    "generate_character_rules_only": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_character_rules"],
    "generate_analyze_novel": ["generate_novel", "generate_analyze_novel"],
    "generate_script_structure": ["generate_novel", "generate_analyze_novel", "generate_script_structure"],
    "generate_scene_outline": ["generate_novel", "generate_analyze_novel", "generate_script_structure", "generate_scene_outline"],
    "generate_script": ["generate_novel", "generate_analyze_novel", "generate_script_structure", "generate_scene_outline", "generate_script"],
    "generate_single_scene": ["generate_single_scene"],
    "generate_scene_diagnosis": ["generate_scene_diagnosis"],
    "generate_script_diagnosis": ["generate_script_diagnosis"],
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


# ── Human-readable step labels ──────────────────────────────────────────

_STEP_LABELS: dict[str, str] = {
    "search_reference_novels": "搜索参考小说",
    "generate_novel": "生成小说",
    "generate_outline": "生成大纲",
    "generate_volume_outline": "生成分卷大纲",
    "generate_character_rules": "生成角色设定",
    "generate_analyze_novel": "分析小说要素",
    "generate_script_structure": "生成剧本结构",
    "generate_scene_outline": "生成分场大纲",
    "generate_script": "生成完整剧本",
    "generate_single_scene": "生成单场剧本",
    "generate_scene_diagnosis": "场景诊断",
    "generate_script_diagnosis": "全剧诊断",
    "generate_novel_tweet": "生成推文",
    "generate_video_tweet": "生成视频推文",
    "generate_storyboard": "生成分镜",
    "generate_lyrics": "生成歌词",
    "generate_song": "生成歌曲",
    "generate_image": "生成图片",
    "generate_video": "生成视频",
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
    first_label = _STEP_LABELS.get(steps[0], steps[0]) if steps else ""
    await _set_checkpoint(task_uuid, "RUNNING", task_data["progress"], first_label, session=session)

    # Interactive finalize: skip all upstream steps, go directly to generate_script
    if input_params.get("interactive") and "generate_script" in steps:
        script_step = "generate_script"
        for s in steps:
            if s == script_step:
                break
            if s not in completed_steps:
                completed_steps.add(s)
                completed_weight += _STEP_WEIGHTS.get(s, 0)
                logger.info("Interactive: skipping upstream step '%s'", s)

    for step_name in steps:
        if step_name in completed_steps:
            logger.info("Resuming: skipping completed step '%s'", step_name)
            continue

        step_fn = _STEP_REGISTRY[step_name]
        step_weight = _STEP_WEIGHTS[step_name]
        # Show partial progress within the step itself — start at a
        # baseline that accounts for "this step has begun" rather than 0.
        progress = min(((completed_weight + step_weight * 0.05) / total_weight) * 100, 99.0)

        try:
            step_label = _STEP_LABELS.get(step_name, step_name)
            await _set_checkpoint(
                task_uuid, "RUNNING", progress, step_label,
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
                task_uuid, "RUNNING", progress, step_label,
                checkpoint=checkpoint,
                session=session,
            )

        except Exception as exc:
            logger.exception("Step '%s' failed for task %s", step_name, task_id)
            await _set_checkpoint(
                task_uuid, "FAILED", progress, step_label,
                error=f"Step '{step_name}' failed: {exc}",
                checkpoint=checkpoint,
                session=session,
            )
            raise

    # SUCCESS
    last_label = _STEP_LABELS.get(steps[-1], steps[-1]) if steps else ""
    await _set_checkpoint(
        task_uuid, "SUCCESS", 100.0, last_label,
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
    name="workflow_generate_lyrics",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_lyrics(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search reference novels → generate lyrics."""
    steps = _WORKFLOWS["generate_lyrics"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_song",
    acks_late=True,
    soft_time_limit=600,
    time_limit=900,
)
def workflow_generate_song(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: generate lyrics → generate song."""
    steps = _WORKFLOWS["generate_song"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_video",
    acks_late=True,
    soft_time_limit=3600,
    time_limit=4800,
)
def workflow_generate_video(task_id: str, user_id: str, input_params: dict) -> dict:
    """Full pipeline: search refs → novel → script → lyrics → song → image → video."""
    steps = _WORKFLOWS["generate_video"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_analyze_novel",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_analyze_novel(task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel → analyze novel for core elements."""
    steps = _WORKFLOWS["generate_analyze_novel"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_script_structure",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_script_structure(task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel → analyze novel → generate structure options."""
    steps = _WORKFLOWS["generate_script_structure"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_scene_outline",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_scene_outline(task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel → analyze novel → generate structure → generate scene outline."""
    steps = _WORKFLOWS["generate_scene_outline"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_tweet",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_novel_tweet(task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel → generate novel_tweet."""
    steps = _WORKFLOWS["generate_novel_tweet"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_video_tweet",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_video_tweet(task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate novel_tweet → generate video_tweet."""
    steps = _WORKFLOWS["generate_video_tweet"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_storyboard",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_storyboard(task_id: str, user_id: str, input_params: dict) -> dict:
    """Step: generate video_tweet → generate storyboard."""
    steps = _WORKFLOWS["generate_storyboard"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_script",
    acks_late=True,
    soft_time_limit=3600,
    time_limit=4800,
)
def workflow_generate_script(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: generate novel → generate script."""
    steps = _WORKFLOWS["generate_script"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_image",
    acks_late=True,
    soft_time_limit=600,
    time_limit=900,
)
def workflow_generate_image(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: generate song → generate image."""
    steps = _WORKFLOWS["generate_image"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_single_scene",
    acks_late=True,
    soft_time_limit=120,
    time_limit=300,
)
def workflow_generate_single_scene(task_id: str, user_id: str, input_params: dict) -> dict:
    """Generate a single scene (interactive mode)."""
    steps = _WORKFLOWS["generate_single_scene"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_scene_diagnosis",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_scene_diagnosis(task_id: str, user_id: str, input_params: dict) -> dict:
    """Diagnose scenes and return diagnosis + modified scenes (interactive mode)."""
    steps = _WORKFLOWS["generate_scene_diagnosis"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_script_diagnosis",
    acks_late=True,
    soft_time_limit=300,
    time_limit=600,
)
def workflow_generate_script_diagnosis(task_id: str, user_id: str, input_params: dict) -> dict:
    """Standalone: diagnose an already-generated script for pacing, dialogue, arc, visual variety."""
    steps = _WORKFLOWS["generate_script_diagnosis"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_outline_only",
    acks_late=True,
    soft_time_limit=600,
    time_limit=900,
)
def workflow_generate_outline_only(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate outline only."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_outline_only"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_volume_outline_only",
    acks_late=True,
    soft_time_limit=600,
    time_limit=900,
)
def workflow_generate_volume_outline_only(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate outline → generate volume outline."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_volume_outline_only"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_character_rules_only",
    acks_late=True,
    soft_time_limit=600,
    time_limit=900,
)
def workflow_generate_character_rules_only(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → outline → volume outline → character rules."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_character_rules_only"]
    return _run_workflow(task_id, user_id, steps, input_params)


# ── Novel generation tasks (long-running, 30min+ per invocation) ─────────

@celery_app.task(
    name="workflow_generate_novel",
    acks_late=True,
    soft_time_limit=1800,
    time_limit=2400,
    max_retries=2,
    default_retry_delay=30,
)
def workflow_generate_novel(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → generate full novel."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_with_outline",
    acks_late=True,
    soft_time_limit=1800,
    time_limit=2400,
    max_retries=2,
    default_retry_delay=30,
)
def workflow_generate_novel_with_outline(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search references → outline → generate novel."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel_with_outline"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_with_volume_outline",
    acks_late=True,
    soft_time_limit=1800,
    time_limit=2400,
    max_retries=2,
    default_retry_delay=30,
)
def workflow_generate_novel_with_volume_outline(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search → outline → volume outline → generate novel."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel_with_volume_outline"]
    return _run_workflow(task_id, user_id, steps, input_params)


@celery_app.task(
    name="workflow_generate_novel_with_character_rules",
    acks_late=True,
    soft_time_limit=2100,
    time_limit=2700,
    max_retries=2,
    default_retry_delay=30,
)
def workflow_generate_novel_with_character_rules(task_id: str, user_id: str, input_params: dict) -> dict:
    """Workflow: search → outline → volume outline → character rules → generate novel."""
    input_params["_task_id"] = task_id
    steps = _WORKFLOWS["generate_novel_with_character_rules"]
    return _run_workflow(task_id, user_id, steps, input_params)

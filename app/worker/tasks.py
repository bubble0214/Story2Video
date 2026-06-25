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
    """Generate full novel content via LLM."""
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
    "generate_outline": _step_generate_outline,
    "generate_volume_outline": _step_generate_volume_outline,
    "generate_character_rules": _step_generate_character_rules,
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
    "generate_outline": 10.0,
    "generate_volume_outline": 15.0,
    "generate_character_rules": 10.0,
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
    "generate_novel_with_outline": ["search_reference_novels", "generate_outline", "generate_novel"],
    "generate_novel_with_volume_outline": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_novel"],
    "generate_novel_with_character_rules": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_character_rules", "generate_novel"],
    "generate_outline_only": ["search_reference_novels", "generate_outline"],
    "generate_volume_outline_only": ["search_reference_novels", "generate_outline", "generate_volume_outline"],
    "generate_character_rules_only": ["search_reference_novels", "generate_outline", "generate_volume_outline", "generate_character_rules"],
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
    soft_time_limit=1200,
    time_limit=1800,
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

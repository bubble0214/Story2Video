from __future__ import annotations

import asyncio
import sys
import logging
from typing import Any
from uuid import UUID

from app.core.celery import celery_app
from app.providers.llm import LLMFactory
from app.providers.prompt import LyricsPromptBuilder, NovelPromptBuilder, ScriptPromptBuilder
from app.repositories.novel import NovelRepository
from app.repositories.task import TaskRepository
from app.utils.database import async_session_factory
from app.utils.llm_key import resolve_user_llm_key

logger = logging.getLogger(__name__)

# ── Async helpers ─────────────────────────────────────────────────────


async def _get_task(task_id: UUID) -> dict | None:
    """Fetch a task record and return its checkpoint + input data."""
    async with async_session_factory() as session:
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
) -> None:
    """Persist workflow progress so we can resume after failure."""
    async with async_session_factory() as session:
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
        async with async_session_factory() as session:
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
    num_chapters = int(input_params.get("num_chapters", 5))
    refs = context.get("references", [])

    parts = [f"# User Instructions\n{custom_prompt}"]
    if refs:
        ref_text = "\n".join(
            f"- {r['title']} (by {r.get('author', 'unknown')}): {r['summary'][:500]}"
            for r in refs
        )
        parts.append(f"# Reference Novels\n{ref_text}")
    parts.append(
        f"\nBased on the above, create a {num_chapters}-chapter outline. "
        f"Each chapter should have a title and a 1-2 sentence description."
    )

    messages = [
        {
            "role": "system",
            "content": "You are a professional novelist and plot architect. "
            "Create detailed, compelling chapter outlines for original novels. "
            "Output ONLY a JSON array with no markdown formatting:\n"
            '[\n  {"title": "Chapter Title", "description": "What happens in this chapter..."},\n'
            "  ...\n]",
        },
        {"role": "user", "content": "\n\n".join(parts)},
    ]

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)

    # Parse JSON from the LLM response
    import json
    import re

    json_match = re.search(r"\[.*\]", content, re.DOTALL)
    if json_match:
        try:
            chapters = json.loads(json_match.group())
        except json.JSONDecodeError:
            chapters = [{"title": f"Chapter {i+1}", "description": ""} for i in range(num_chapters)]
    else:
        chapters = [{"title": f"Chapter {i+1}", "description": ""} for i in range(num_chapters)]

    return {"outline": {"chapters": chapters}}


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

    novel = context.get("novel_content", "")
    if not novel:
        raise ValueError("No novel content provided for script generation")

    builder = ScriptPromptBuilder()
    messages = builder.build(
        novel_content=novel,
        title=input_params.get("title", ""),
        style=input_params.get("script_style", ""),
    )

    llm_key, llm_provider, base_url, model = await resolve_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"script_content": content}


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
    "generate_chapters": _step_generate_chapters,
    "generate_script": _step_generate_script,
    "generate_lyrics": _step_generate_lyrics,
    "generate_song": _step_generate_song,
    "generate_image": _step_generate_image,
    "generate_video": _step_generate_video,
}

_STEP_WEIGHTS = {
    "search_reference_novels": 5.0,
    "generate_novel": 20.0,
    "generate_outline": 10.0,
    "generate_chapters": 50.0,
    "generate_script": 10.0,
    "generate_lyrics": 15.0,
    "generate_song": 10.0,
    "generate_image": 5.0,
    "generate_video": 5.0,
}

# ── Workflow definitions ──────────────────────────────────────────────

_WORKFLOWS: dict[str, list[str]] = {
    "generate_novel": ["search_reference_novels", "generate_novel"],
    "generate_long_novel": ["search_reference_novels", "generate_outline", "generate_chapters"],
    "generate_script": ["generate_novel", "generate_script"],
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


async def _run_workflow_async(
    task_id: str, user_id: str, steps: list[str], input_params: dict,
) -> dict:
    """Async workflow engine.  Call via asyncio.run() in Celery workers,
    or directly in async tests."""
    task_uuid = UUID(task_id)
    user_uuid = UUID(user_id)
    task_data = await _get_task(task_uuid)
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
    await _set_checkpoint(task_uuid, "RUNNING", task_data["progress"], steps[0] if steps else "")

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
            )

            # Execute the step
            step_result = await step_fn(input_params, context, user_id=user_uuid)
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
            )

        except Exception as exc:
            logger.exception("Step '%s' failed for task %s", step_name, task_id)
            await _set_checkpoint(
                task_uuid, "FAILED", progress, step_name,
                error=f"Step '{step_name}' failed: {exc}",
                checkpoint=checkpoint,
            )
            raise

    # SUCCESS
    await _set_checkpoint(
        task_uuid, "SUCCESS", 100.0, steps[-1],
        checkpoint=checkpoint,
        result=context,
    )
    return context


# ── Workflow engine (sync wrapper for Celery) ────────────────────────


def _run_workflow(task_id: str, user_id: str, steps: list[str], input_params: dict) -> dict:
    """Sync wrapper around the async workflow engine for Celery workers."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return asyncio.run(_run_workflow_async(task_id, user_id, steps, input_params))


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

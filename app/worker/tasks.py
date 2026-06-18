from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from app.core.celery import celery_app
from app.providers.embedding import get_embedding_provider
from app.providers.llm import LLMFactory
from app.providers.prompt import LyricsPromptBuilder, NovelPromptBuilder, ScriptPromptBuilder
from app.repositories.api_key import ApiKeyRepository
from app.repositories.novel import NovelRepository
from app.repositories.task import TaskRepository
from app.repositories.user_preference import UserPreferenceRepository
from app.utils.database import async_session_factory
from app.utils.encryption import decrypt_to_plaintext

logger = logging.getLogger(__name__)

# ── API key resolution ──────────────────────────────────────────────


async def _get_user_api_key_from_db(user_id: UUID, provider: str) -> str | None:
    """Retrieve the decrypted API key for a user+provider combo.

    Returns ``None`` if no key is stored — no env fallback.
    """
    async with async_session_factory() as session:
        repo = ApiKeyRepository(session)
        key_obj = await repo.get_by_user_and_provider(user_id, provider)
        if key_obj is not None and key_obj.encrypted_key:
            return decrypt_to_plaintext(key_obj.encrypted_key)
    return None


async def _get_user_llm_key(
    user_id: UUID, input_params: dict | None = None,
) -> tuple[str, str, str | None, str | None]:
    """Return (api_key, provider, base_url, model_name) for the user's LLM.

    Only uses keys the user has explicitly saved in Settings.
    Raises ``ValueError`` if no matching key is found.
    """
    # 1. Check input_params for an explicit model selection
    if input_params:
        model_val = input_params.get("model")
        if model_val and isinstance(model_val, str) and "::" in model_val:
            provider_part, model_part = model_val.split("::", 1)
            async with async_session_factory() as session:
                repo = ApiKeyRepository(session)
                key_obj = await repo.get_by_user_and_provider(
                    user_id, provider_part, model_name=model_part,
                )
                if key_obj is None:
                    key_obj = await repo.get_by_user_and_provider(
                        user_id, provider_part,
                    )
                if key_obj is not None and key_obj.encrypted_key:
                    return (
                        decrypt_to_plaintext(key_obj.encrypted_key),
                        provider_part,
                        key_obj.base_url,
                        model_part,
                    )
                raise ValueError(
                    f"No API key found for provider '{provider_part}'. "
                    f"Please go to Settings and add your {provider_part} API key."
                )
        elif model_val and isinstance(model_val, str) and model_val:
            async with async_session_factory() as session:
                repo = ApiKeyRepository(session)
                key_obj = await repo.get_by_user_and_provider(user_id, model_val)
                if key_obj is not None and key_obj.encrypted_key:
                    return (
                        decrypt_to_plaintext(key_obj.encrypted_key),
                        model_val,
                        key_obj.base_url,
                        key_obj.model_name,
                    )
                raise ValueError(
                    f"No API key found for provider '{model_val}'. "
                    f"Please go to Settings and add your {model_val} API key."
                )

    # 2. No explicit model — try all user-saved keys
    async with async_session_factory() as session:
        repo = ApiKeyRepository(session)
        all_keys = await repo.list_by_user(user_id)
        # Prefer LLM providers (skip music/avatar-specific keys)
        llm_providers = {"openai", "claude", "gemini", "deepseek", "qwen", "glm", "custom"}
        for key_obj in all_keys:
            if key_obj.provider in llm_providers and key_obj.encrypted_key:
                return (
                    decrypt_to_plaintext(key_obj.encrypted_key),
                    key_obj.provider,
                    key_obj.base_url,
                    key_obj.model_name,
                )

    raise ValueError(
        "No LLM API key configured. Please go to Settings and add at least one "
        "LLM provider API key (OpenAI, Claude, DeepSeek, etc.)."
    )

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

    tags = input_params.get("tags", "")
    keywords = [t.strip() for t in tags.split(",") if t.strip()]
    if not keywords:
        return {"references": []}

    if user_id is None:
        raise ValueError("User ID required to resolve embedding API key")

    # Look up user's embedding key — only from user-saved keys
    async with async_session_factory() as session:
        pref_repo = UserPreferenceRepository(session)
        user_pref = await pref_repo.get_by_user(user_id)
        embedding_provider = user_pref.embedding_provider if (user_pref and user_pref.embedding_provider) else None

        if not embedding_provider:
            raise ValueError(
                "No embedding provider configured. Please go to Settings, "
                "select an Embedding Provider, and save your API key."
            )

        repo = ApiKeyRepository(session)
        key_obj = await repo.get_by_user_and_provider(user_id, embedding_provider)
        if key_obj is None or not key_obj.encrypted_key:
            raise ValueError(
                f"No API key found for embedding provider '{embedding_provider}'. "
                f"Please go to Settings and add your {embedding_provider} API key."
            )

        api_key = decrypt_to_plaintext(key_obj.encrypted_key)
        base_url = key_obj.base_url
        model_name = key_obj.model_name

    try:
        provider = get_embedding_provider(embedding_provider, api_key, base_url, model_name)
        embedding = await provider.generate(" ".join(keywords))
    except Exception:
        logger.warning("Embedding failed, skipping reference search", exc_info=True)
        return {"references": []}

    async with async_session_factory() as session:
        repo = NovelRepository(session)
        results = await repo.search_by_embedding(embedding, limit=3)
        references = [
            {"id": str(n.id), "title": n.title, "summary": n.summary, "score": s}
            for n, s in results
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

    llm_key, llm_provider, base_url, model = await _get_user_llm_key(user_id, input_params)
    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
    content = await provider.chat(messages)
    return {"novel_content": content}


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

    llm_key, llm_provider, base_url, model = await _get_user_llm_key(user_id, input_params)
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
    llm_key, llm_provider, base_url, model = await _get_user_llm_key(user_id, input_params)
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
    task_uuid = None
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

    return {
        "chapters": generated_chapters,
        "novel_content": full_novel,
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

    llm_key, llm_provider, base_url, model = await _get_user_llm_key(user_id, input_params)
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

    llm_key, llm_provider, base_url, model = await _get_user_llm_key(user_id, input_params)
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

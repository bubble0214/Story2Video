from __future__ import annotations

from app.core.celery import celery_app as app
from app.worker.tasks import (
    workflow_extract_lyrics_core,
    workflow_generate_image,
    workflow_generate_lyrics,
    workflow_generate_novel,
    workflow_generate_outline_only,
    workflow_generate_volume_outline_only,
    workflow_generate_novel_with_outline,
    workflow_generate_novel_with_volume_outline,
    workflow_generate_character_rules_only,
    workflow_generate_novel_with_character_rules,
    workflow_generate_script,
    workflow_generate_script_structure,
    workflow_generate_scene_outline,
    workflow_generate_script_diagnosis,
    workflow_generate_single_scene,
    workflow_generate_scene_diagnosis,
    workflow_generate_song,
    workflow_generate_video,
)

__all__ = [
    "workflow_extract_lyrics_core",
    "workflow_generate_image",
    "workflow_generate_novel",
    "workflow_generate_lyrics",
    "workflow_generate_outline_only",
    "workflow_generate_volume_outline_only",
    "workflow_generate_novel_with_outline",
    "workflow_generate_novel_with_volume_outline",
    "workflow_generate_character_rules_only",
    "workflow_generate_novel_with_character_rules",
    "workflow_generate_script",
    "workflow_generate_script_structure",
    "workflow_generate_scene_outline",
    "workflow_generate_script_diagnosis",
    "workflow_generate_single_scene",
    "workflow_generate_scene_diagnosis",
    "workflow_generate_song",
    "workflow_generate_video",
]
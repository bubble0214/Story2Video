from __future__ import annotations

from app.worker.tasks import (
    workflow_generate_image,
    workflow_generate_lyrics,
    workflow_generate_novel,
    workflow_generate_script,
    workflow_generate_song,
    workflow_generate_video,
)

__all__ = [
    "workflow_generate_image",
    "workflow_generate_novel",
    "workflow_generate_lyrics",
    "workflow_generate_script",
    "workflow_generate_song",
    "workflow_generate_video",
]
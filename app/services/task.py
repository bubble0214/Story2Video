from __future__ import annotations

from uuid import UUID

from app.core.celery import celery_app
from app.models.task import Task
from app.repositories.task import TaskRepository


class TaskService:
    """Service layer for workflow task management."""

    WORKFLOW_MAP: dict[str, str] = {
        "generate_outline_only": "workflow_generate_outline_only",
        "generate_volume_outline_only": "workflow_generate_volume_outline_only",
        "generate_character_rules_only": "workflow_generate_character_rules_only",
        "generate_script": "workflow_generate_script",
        "generate_analyze_novel": "workflow_generate_analyze_novel",
        "generate_script_structure": "workflow_generate_script_structure",
        "generate_scene_outline": "workflow_generate_scene_outline",
        "generate_script_diagnosis": "workflow_generate_script_diagnosis",
        "generate_single_scene": "workflow_generate_single_scene",
        "generate_scene_diagnosis": "workflow_generate_scene_diagnosis",
        "generate_novel_tweet": "workflow_generate_novel_tweet",
        "generate_video_tweet": "workflow_generate_video_tweet",
        "generate_storyboard": "workflow_generate_storyboard",
        "generate_lyrics": "workflow_generate_lyrics",
        "extract_lyrics_core": "workflow_extract_lyrics_core",
        "generate_song": "workflow_generate_song",
        "generate_music_style": "workflow_generate_music_style",
        "generate_image": "workflow_generate_image",
        "canvas_generate_image": "workflow_canvas_generate_image",
        "canvas_parse_script": "workflow_canvas_parse_script",
        "canvas_generate_scene_prompt": "workflow_canvas_generate_scene_prompt",
        "generate_video": "workflow_generate_video",
        "generate_mv": "workflow_generate_mv",
        "generate_mv_storyboard": "workflow_generate_mv_storyboard",
    }

    def __init__(self, repo: TaskRepository) -> None:
        self._repo = repo

    async def create_task(
        self,
        user_id: UUID,
        workflow_type: str,
        input_params: dict,
    ) -> Task:
        """Create a task record and dispatch the Celery workflow."""
        if workflow_type not in self.WORKFLOW_MAP:
            raise ValueError(f"Unsupported workflow type: {workflow_type}")

        task = await self._repo.create(
            user_id=user_id,
            workflow_type=workflow_type,
            input_params=input_params,
        )

        celery_task_name = self.WORKFLOW_MAP[workflow_type]
        celery_app.send_task(
            celery_task_name,
            args=[str(task.id), str(user_id), input_params],
            task_id=str(task.id),
            queue=self._queue_for_workflow(workflow_type),
        )

        return task

    def _queue_for_workflow(self, workflow_type: str) -> str:
        queue_map = {
            "generate_outline_only": "novel_generation",
            "generate_volume_outline_only": "novel_generation",
            "generate_character_rules_only": "novel_generation",
            "generate_script": "script_generation",
            "generate_analyze_novel": "script_generation",
            "generate_script_structure": "script_generation",
            "generate_scene_outline": "script_generation",
            "generate_script_diagnosis": "script_generation",
            "generate_single_scene": "script_generation",
            "generate_scene_diagnosis": "script_generation",
            "generate_novel_tweet": "script_generation",
            "generate_video_tweet": "script_generation",
            "generate_storyboard": "script_generation",
            "generate_lyrics": "lyrics_generation",
            "extract_lyrics_core": "lyrics_generation",
            "plan_lyrics_structure": "lyrics_generation",
            "generate_music_style": "lyrics_generation",
            "generate_song": "music_generation",
            "generate_image": "image_generation",
            "canvas_generate_image": "image_generation",
            "canvas_parse_script": "image_generation",
            "canvas_generate_scene_prompt": "image_generation",
            "generate_video": "video_generation",
            "generate_mv": "video_generation",
            "generate_mv_storyboard": "script_generation",
        }
        return queue_map[workflow_type]

    async def get_task(self, task_id: UUID) -> Task | None:
        return await self._repo.get_by_id(task_id)

    async def list_user_tasks(
        self,
        user_id: UUID,
        *,
        limit: int = 20,
        offset: int = 0,
        workflow_type: str | None = None,
    ) -> list[Task]:
        return await self._repo.list_by_user(
            user_id=user_id,
            limit=limit,
            offset=offset,
            workflow_type=workflow_type,
        )

    async def update_checkpoint(
        self,
        task_id: UUID,
        status: str,
        progress: float,
        current_step: str,
        error_message: str = "",
        checkpoint_data: dict | None = None,
        result: dict | None = None,
    ) -> None:
        await self._repo.update_status(
            task_id=task_id,
            status=status,
            progress=progress,
            current_step=current_step,
            error_message=error_message,
            checkpoint_data=checkpoint_data,
            result=result,
        )

    async def delete_task(self, task_id: UUID, user_id: UUID) -> None:
        obj = await self._repo.get_by_id(task_id)
        if obj is None or obj.user_id != user_id:
            raise ValueError("Task not found")
        await self._repo.delete(task_id)

    async def update_task_result(self, task_id: UUID, result_update: dict) -> Task:
        """Merge result_update into the task's existing result dict."""
        return await self._repo.update_result(task_id, result_update)

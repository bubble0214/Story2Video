from __future__ import annotations

from uuid import UUID

from app.core.celery import celery_app
from app.models.task import Task
from app.repositories.task import TaskRepository


class TaskService:
    """Service layer for workflow task management."""

    WORKFLOW_MAP: dict[str, str] = {
        "generate_novel": "workflow_generate_novel",
        "generate_long_novel": "workflow_generate_long_novel",
        "generate_script": "workflow_generate_script",
        "generate_lyrics": "workflow_generate_lyrics",
        "generate_song": "workflow_generate_song",
        "generate_image": "workflow_generate_image",
        "generate_video": "workflow_generate_video",
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
            "generate_novel": "novel_generation",
            "generate_long_novel": "novel_generation",
            "generate_script": "script_generation",
            "generate_lyrics": "lyrics_generation",
            "generate_song": "music_generation",
            "generate_image": "image_generation",
            "generate_video": "video_generation",
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

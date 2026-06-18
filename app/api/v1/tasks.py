from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUserId, get_db
from app.repositories.task import TaskRepository
from app.schemas.common import MessageResp
from app.schemas.task import CreateTaskReq, TaskListResp, TaskProgressResp, TaskResp
from app.services.task import TaskService

router = APIRouter()


def get_task_service(db: AsyncSession = Depends(get_db)) -> TaskService:
    return TaskService(TaskRepository(db))


@router.post(
    "/create",
    response_model=TaskResp,
    status_code=status.HTTP_201_CREATED,
    summary="Create and start a new workflow task",
)
async def create_task(
    body: CreateTaskReq,
    user_id: CurrentUserId,
    svc: TaskService = Depends(get_task_service),
) -> TaskResp:
    """Create a workflow task and dispatch it to the Celery worker."""
    try:
        task = await svc.create_task(
            user_id=UUID(user_id),
            workflow_type=body.workflow_type,
            input_params=body.input_params,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return TaskResp.model_validate(task)


@router.get(
    "/list",
    response_model=TaskListResp,
    summary="List user's tasks",
)
async def list_tasks(
    user_id: CurrentUserId,
    svc: TaskService = Depends(get_task_service),
    workflow_type: str | None = Query(None, description="Filter by workflow type"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> TaskListResp:
    """Retrieve a paginated list of tasks for the current user."""
    tasks = await svc.list_user_tasks(
        user_id=UUID(user_id),
        limit=limit,
        offset=offset,
        workflow_type=workflow_type,
    )
    return TaskListResp(
        items=[TaskResp.model_validate(t) for t in tasks],
        total=len(tasks),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{task_id}",
    response_model=TaskResp,
    summary="Get task status and result",
)
async def get_task(
    task_id: UUID,
    user_id: CurrentUserId,
    svc: TaskService = Depends(get_task_service),
) -> TaskResp:
    """Retrieve the current status, progress, and result of a task."""
    task = await svc.get_task(task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    if str(task.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Task does not belong to this user",
        )
    return TaskResp.model_validate(task)


@router.delete(
    "/{task_id}",
    response_model=MessageResp,
    summary="Delete a workflow task",
)
async def delete_task(
    task_id: UUID,
    user_id: CurrentUserId,
    svc: TaskService = Depends(get_task_service),
) -> MessageResp:
    """Delete a task belonging to the current user."""
    try:
        await svc.delete_task(task_id, UUID(user_id))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    return MessageResp(message="Task deleted")
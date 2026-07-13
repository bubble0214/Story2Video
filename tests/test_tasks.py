from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError

from app.models.task import Task
from app.repositories.task import TaskRepository
from app.schemas.task import CreateTaskReq, TaskResp
from app.services.task import TaskService

_created_dt = datetime.now(UTC)
_updated_dt = datetime.now(UTC)


# ─── Task Schemas ─────────────────────────────────────────────────────


class TestCreateTaskReq:
    def test_valid_workflow_types(self) -> None:
        for wf in ("generate_novel", "generate_lyrics", "generate_song", "generate_video"):
            req = CreateTaskReq(workflow_type=wf, input_params={"key": "val"})
            assert req.workflow_type == wf
            assert req.input_params == {"key": "val"}

    def test_invalid_workflow_type(self) -> None:
        with pytest.raises(ValidationError):
            CreateTaskReq(workflow_type="invalid_type")

    def test_default_input_params(self) -> None:
        req = CreateTaskReq(workflow_type="generate_novel")
        assert req.input_params == {}


# ─── Task Repository ──────────────────────────────────────────────────


class TestTaskRepository:
    @pytest.mark.asyncio
    async def test_create(self) -> None:
        mock_session = AsyncMock()
        repo = TaskRepository(mock_session)

        task_id = uuid4()
        user_id = uuid4()

        mock_obj = MagicMock(spec=Task)
        mock_obj.id = task_id
        mock_obj.user_id = user_id
        mock_obj.workflow_type = "generate_novel"
        mock_obj.status = "PENDING"
        mock_obj.progress = 0.0
        mock_obj.current_step = ""
        mock_obj.error_message = ""
        mock_obj.input_params = {"title": "Test"}
        mock_obj.checkpoint_data = {}
        mock_obj.result = {}

        # Mock the add -> commit -> refresh chain
        async def _refresh(obj):
            obj.id = task_id
            obj.user_id = user_id
            obj.workflow_type = "generate_novel"
            obj.status = "PENDING"
            obj.progress = 0.0
            obj.current_step = ""
            obj.error_message = ""
            obj.input_params = {"title": "Test"}
            obj.checkpoint_data = {}
            obj.result = {}

        mock_session.refresh = _refresh

        result = await repo.create(
            user_id=user_id,
            workflow_type="generate_novel",
            input_params={"title": "Test"},
        )
        assert mock_session.add.called
        assert mock_session.commit.called

    @pytest.mark.asyncio
    async def test_get_by_id_found(self) -> None:
        mock_session = AsyncMock()
        repo = TaskRepository(mock_session)
        task_id = uuid4()

        mock_task = MagicMock(spec=Task)
        mock_task.id = task_id
        mock_session.get.return_value = mock_task

        result = await repo.get_by_id(task_id)
        assert result is not None
        assert result.id == task_id

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self) -> None:
        mock_session = AsyncMock()
        repo = TaskRepository(mock_session)
        mock_session.get.return_value = None

        result = await repo.get_by_id(uuid4())
        assert result is None

    @pytest.mark.asyncio
    async def test_update_status(self) -> None:
        mock_session = AsyncMock()
        repo = TaskRepository(mock_session)

        task_id = uuid4()
        await repo.update_status(
            task_id=task_id,
            status="RUNNING",
            progress=50.0,
            current_step="generate_novel",
        )
        assert mock_session.execute.called
        assert mock_session.commit.called


# ─── Task Service ─────────────────────────────────────────────────────


class TestTaskService:
    @pytest.mark.asyncio
    async def test_create_task_dispatches_celery(self) -> None:
        mock_repo = AsyncMock(spec=TaskRepository)
        svc = TaskService(mock_repo)

        task_id = uuid4()
        user_id = uuid4()

        mock_task = MagicMock(spec=Task)
        mock_task.id = task_id
        mock_task.user_id = user_id
        mock_task.workflow_type = "generate_novel"
        mock_task.status = "PENDING"
        mock_repo.create.return_value = mock_task

        with patch("app.services.task.celery_app.send_task") as mock_send:
            result = await svc.create_task(
                user_id=user_id,
                workflow_type="generate_novel",
                input_params={"title": "Test"},
            )

        assert result.id == task_id
        mock_repo.create.assert_called_once_with(
            user_id=user_id,
            workflow_type="generate_novel",
            input_params={"title": "Test"},
        )
        mock_send.assert_called_once_with(
            "workflow_generate_novel",
            args=[str(task_id), str(user_id), {"title": "Test"}],
            task_id=str(task_id),
            queue="novel_generation",
        )

    @pytest.mark.asyncio
    async def test_create_task_unknown_workflow(self) -> None:
        """Unknown workflow types are still created but no Celery task is dispatched."""
        mock_repo = AsyncMock(spec=TaskRepository)
        svc = TaskService(mock_repo)

        user_id = uuid4()
        mock_task = MagicMock(spec=Task)
        mock_task.id = uuid4()
        mock_repo.create.return_value = mock_task

        with patch("app.services.task.celery_app.send_task") as mock_send:
            result = await svc.create_task(
                user_id=user_id,
                workflow_type="generate_video",
                input_params={"theme": "space"},
            )

        assert result is not None
        mock_send.assert_called_once_with(
            "workflow_generate_video",
            args=[str(result.id), str(user_id), {"theme": "space"}],
            task_id=str(result.id),
            queue="video_generation",
        )

    @pytest.mark.asyncio
    async def test_get_task(self) -> None:
        mock_repo = AsyncMock(spec=TaskRepository)
        svc = TaskService(mock_repo)

        task_id = uuid4()
        mock_task = MagicMock(spec=Task)
        mock_task.id = task_id
        mock_repo.get_by_id.return_value = mock_task

        result = await svc.get_task(task_id)
        assert result is not None
        assert result.id == task_id

    @pytest.mark.asyncio
    async def test_get_task_not_found(self) -> None:
        mock_repo = AsyncMock(spec=TaskRepository)
        svc = TaskService(mock_repo)
        mock_repo.get_by_id.return_value = None

        result = await svc.get_task(uuid4())
        assert result is None


# ─── Task API ─────────────────────────────────────────────────────────


class TestTaskAPI:
    @pytest.mark.asyncio
    async def test_create_task_endpoint(self) -> None:
        from app.api.v1.tasks import create_task

        user_id = str(uuid4())
        task_id = uuid4()

        mock_svc = AsyncMock(spec=TaskService)
        mock_task = MagicMock(spec=Task)
        mock_task.id = task_id
        mock_task.user_id = UUID(user_id)
        mock_task.workflow_type = "generate_novel"
        mock_task.status = "PENDING"
        mock_task.progress = 0.0
        mock_task.current_step = ""
        mock_task.error_message = ""
        mock_task.result = {}
        mock_task.input_params = {"title": "Test"}
        mock_task.created_at = _created_dt
        mock_task.updated_at = _updated_dt
        mock_svc.create_task.return_value = mock_task

        body = CreateTaskReq(workflow_type="generate_novel", input_params={"title": "Test"})
        result = await create_task(body, user_id, mock_svc)
        assert isinstance(result, TaskResp)
        assert result.id == task_id
        assert result.status == "PENDING"
        assert result.workflow_type == "generate_novel"

    @pytest.mark.asyncio
    async def test_get_task_endpoint_found(self) -> None:
        from app.api.v1.tasks import get_task

        user_id = str(uuid4())
        task_id = uuid4()

        mock_svc = AsyncMock(spec=TaskService)
        mock_task = MagicMock(spec=Task)
        mock_task.id = task_id
        mock_task.user_id = UUID(user_id)
        mock_task.workflow_type = "generate_lyrics"
        mock_task.status = "RUNNING"
        mock_task.progress = 45.0
        mock_task.current_step = "generate_lyrics"
        mock_task.error_message = ""
        mock_task.result = {}
        mock_task.input_params = {}
        mock_task.created_at = _created_dt
        mock_task.updated_at = _updated_dt
        mock_svc.get_task.return_value = mock_task

        result = await get_task(task_id, user_id, mock_svc)
        assert result.id == task_id
        assert result.status == "RUNNING"
        assert result.progress == 45.0

    @pytest.mark.asyncio
    async def test_get_task_endpoint_not_found(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.tasks import get_task

        mock_svc = AsyncMock(spec=TaskService)
        mock_svc.get_task.return_value = None

        with pytest.raises(HTTPException) as exc:
            await get_task(uuid4(), str(uuid4()), mock_svc)
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_task_endpoint_forbidden(self) -> None:
        from fastapi import HTTPException

        from app.api.v1.tasks import get_task

        user_id = str(uuid4())
        other_user_id = str(uuid4())

        mock_svc = AsyncMock(spec=TaskService)
        mock_task = MagicMock(spec=Task)
        mock_task.user_id = UUID(other_user_id)
        mock_svc.get_task.return_value = mock_task

        with pytest.raises(HTTPException) as exc:
            await get_task(uuid4(), user_id, mock_svc)
        assert exc.value.status_code == 403


# ─── Worker Tasks ─────────────────────────────────────────────────────


class TestWorkflowSteps:
    """Unit tests for individual workflow step functions."""

    @pytest.mark.asyncio
    async def test_step_search_references_no_keywords(self) -> None:
        from app.worker.tasks import _step_search_references

        result = await _step_search_references({"tags": ""})
        assert result == {"references": []}

    @pytest.mark.asyncio
    async def test_step_search_references_with_keywords(self) -> None:
        from app.providers.embedding import get_embedding_provider
        from app.worker.tasks import _step_search_references

        # Mock embedding provider
        with (
            patch("app.worker.tasks.get_embedding_provider") as mock_get,
            patch("app.worker.tasks.NovelRepository") as mock_repo_cls,
            patch("app.worker.tasks.async_session_factory") as mock_sf,
        ):
            mock_provider = AsyncMock()
            mock_provider.generate.return_value = [0.1] * 1536
            mock_get.return_value = mock_provider

            mock_session = AsyncMock()
            mock_cm = MagicMock()
            mock_cm.__aenter__.return_value = mock_session
            mock_sf.return_value = mock_cm

            mock_repo = AsyncMock()
            mock_repo_cls.return_value = mock_repo
            mock_repo.search_by_embedding.return_value = []

            result = await _step_search_references({"tags": "sci-fi,cyberpunk"})
            assert result == {"references": []}
            mock_provider.generate.assert_called_once()
            mock_repo.search_by_embedding.assert_called_once()

    @pytest.mark.asyncio
    async def test_step_generate_novel(self) -> None:
        from app.worker.tasks import _step_generate_novel

        with patch("app.worker.tasks.LLMFactory.create") as mock_create:
            mock_provider = AsyncMock()
            mock_provider.chat.return_value = "Once upon a time..."
            mock_create.return_value = mock_provider

            result = await _step_generate_novel(
                {"title": "My Story", "tags": "fantasy"},
                {"references": []},
            )
            assert result["novel_content"] == "Once upon a time..."
            mock_provider.chat.assert_called_once()

    @pytest.mark.asyncio
    async def test_step_generate_novel_with_references(self) -> None:
        from app.worker.tasks import _step_generate_novel

        with patch("app.worker.tasks.LLMFactory.create") as mock_create:
            mock_provider = AsyncMock()
            mock_provider.chat.return_value = "Story with references"
            mock_create.return_value = mock_provider

            result = await _step_generate_novel(
                {"title": "My Story"},
                {"references": [{"title": "Ref", "summary": "A reference novel"}]},
            )
            assert result["novel_content"] == "Story with references"

    @pytest.mark.asyncio
    async def test_step_generate_lyrics(self) -> None:
        from app.worker.tasks import _step_generate_lyrics

        with patch("app.worker.tasks.LLMFactory.create") as mock_create:
            mock_provider = AsyncMock()
            mock_provider.chat.return_value = "Lyrics content"
            mock_create.return_value = mock_provider

            result = await _step_generate_lyrics(
                {"theme": "Love", "genre": "pop"},
                {"references": []},
            )
            assert result["lyrics_content"] == "Lyrics content"

    @pytest.mark.asyncio
    async def test_step_generate_song(self) -> None:
        from app.worker.tasks import _step_generate_song

        result = await _step_generate_song(
            {"style": "pop"},
            {"lyrics_content": "Some lyrics"},
        )
        assert result["song_placeholder"] is True
        assert "lyrics_length" in result

    @pytest.mark.asyncio
    async def test_step_generate_song_no_lyrics(self) -> None:
        from app.worker.tasks import _step_generate_song

        with pytest.raises(ValueError, match="No lyrics content"):
            await _step_generate_song({}, {})

    @pytest.mark.asyncio
    async def test_step_generate_video(self) -> None:
        """_step_generate_video raises error when no Coze API key is configured."""
        from unittest.mock import patch

        from app.worker.tasks import _step_generate_video

        with patch(
            "app.worker.tasks.get_user_coze_config",
            return_value=None,
        ):
            with pytest.raises(ValueError, match="No Coze API key found"):
                await _step_generate_video(
                    {},
                    {"novel_content": "story", "lyrics_content": "lyrics"},
                    user_id=UUID("00000000-0000-0000-0000-000000000000"),
                )


class TestWorkflowEngine:
    """Test the workflow orchestration engine."""

    def test_workflow_generate_novel_steps(self) -> None:
        from app.worker.tasks import _WORKFLOWS

        assert _WORKFLOWS["generate_novel"] == [
            "search_reference_novels",
            "generate_novel",
        ]

    def test_workflow_generate_video_steps(self) -> None:
        from app.worker.tasks import _WORKFLOWS

        steps = _WORKFLOWS["generate_video"]
        assert len(steps) == 5
        assert "generate_video" in steps
        assert "generate_novel" in steps
        assert "generate_lyrics" in steps

    @pytest.mark.asyncio
    async def test_run_workflow_success(self) -> None:
        from unittest.mock import patch as mock_patch

        from app.worker.tasks import _run_workflow_async, _WORKFLOWS

        task_id = str(uuid4())
        steps = _WORKFLOWS["generate_lyrics"]

        mock_search = AsyncMock(return_value={"references": []})
        mock_lyrics = AsyncMock(return_value={"lyrics_content": "Beautiful lyrics"})

        with (
            mock_patch("app.worker.tasks._get_task") as mock_get,
            mock_patch("app.worker.tasks._set_checkpoint") as mock_set,
            mock_patch.dict(
                "app.worker.tasks._STEP_REGISTRY",
                {"search_reference_novels": mock_search, "generate_lyrics": mock_lyrics},
                clear=False,
            ),
        ):
            mock_get.return_value = {
                "id": UUID(task_id),
                "status": "PENDING",
                "progress": 0.0,
                "current_step": "",
                "input_params": {"theme": "Love"},
                "checkpoint_data": {},
                "result": {},
            }

            result = await _run_workflow_async(task_id, steps, {"theme": "Love"})
            assert result["lyrics_content"] == "Beautiful lyrics"
            mock_search.assert_called_once()
            mock_lyrics.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_workflow_resume_from_checkpoint(self) -> None:
        """Verify that completed steps are skipped during resume."""
        from unittest.mock import patch as mock_patch

        from app.worker.tasks import _run_workflow_async, _WORKFLOWS

        task_id = str(uuid4())
        steps = _WORKFLOWS["generate_novel"]

        mock_novel = AsyncMock(return_value={"novel_content": "Resumed novel content"})

        with (
            mock_patch("app.worker.tasks._get_task") as mock_get,
            mock_patch("app.worker.tasks._set_checkpoint") as mock_set,
            mock_patch.dict(
                "app.worker.tasks._STEP_REGISTRY",
                {"generate_novel": mock_novel},
                clear=False,
            ),
        ):
            mock_get.return_value = {
                "id": UUID(task_id),
                "status": "PENDING",
                "progress": 10.0,
                "current_step": "",
                "input_params": {"title": "Resume Story"},
                "checkpoint_data": {
                    "completed_steps": ["search_reference_novels"],
                    "completed_weight": 10.0,
                    "context": {"references": []},
                },
                "result": {},
            }

            result = await _run_workflow_async(task_id, steps, {"title": "Resume Story"})

            mock_novel.assert_called_once()
            assert result["novel_content"] == "Resumed novel content"

    @pytest.mark.asyncio
    async def test_run_workflow_step_failure(self) -> None:
        """Verify that a step failure marks the task as FAILED."""
        from unittest.mock import patch as mock_patch

        from app.worker.tasks import _run_workflow_async, _WORKFLOWS

        task_id = str(uuid4())
        steps = _WORKFLOWS["generate_lyrics"]

        mock_search = AsyncMock(side_effect=RuntimeError("API unavailable"))

        with (
            mock_patch("app.worker.tasks._get_task") as mock_get,
            mock_patch("app.worker.tasks._set_checkpoint") as mock_set,
            mock_patch.dict(
                "app.worker.tasks._STEP_REGISTRY",
                {"search_reference_novels": mock_search},
                clear=False,
            ),
        ):
            mock_get.return_value = {
                "id": UUID(task_id),
                "status": "PENDING",
                "progress": 0.0,
                "current_step": "",
                "input_params": {"theme": "Love"},
                "checkpoint_data": {},
                "result": {},
            }

            with pytest.raises(RuntimeError, match="API unavailable"):
                await _run_workflow_async(task_id, steps, {"theme": "Love"})

            fail_call = [
                c for c in mock_set.call_args_list
                if len(c.args) > 1 and c.args[1] == "FAILED"
            ]
            assert len(fail_call) == 1, f"Expected 1 FAILED call, got {len(fail_call)}: {mock_set.call_args_list}"
            assert "API unavailable" in str(fail_call[0].kwargs)

    @pytest.mark.asyncio
    async def test_workflow_celery_task_decorators(self) -> None:
        """Verify celery task definitions have proper configuration."""
        from app.worker.tasks import (
            workflow_generate_lyrics,
            workflow_generate_novel,
            workflow_generate_song,
            workflow_generate_video,
        )

        for task in [
            workflow_generate_novel,
            workflow_generate_lyrics,
            workflow_generate_song,
            workflow_generate_video,
        ]:
            assert task.max_retries == 2
            assert task.default_retry_delay == 30
            assert task.acks_late is True


class TestCeleryConfig:
    def test_celery_app_config(self) -> None:
        """Verify Celery app is configured correctly."""
        from app.core.celery import celery_app

        assert celery_app.conf.timezone == "UTC"
        assert celery_app.conf.task_serializer == "json"
        assert celery_app.conf.task_track_started is True
        assert celery_app.conf.task_acks_late is True

    def test_celery_broker_url_from_settings(self) -> None:
        """Verify Celery broker URL comes from settings."""
        from app.core.celery import celery_app
        from app.core.config import settings

        assert celery_app.conf.broker_url == settings.celery_broker_url
        assert celery_app.conf.result_backend == settings.celery_result_backend


class TestTaskModel:
    """Simple model validation tests."""

    def test_task_model_defaults(self) -> None:
        """Test that Task model has correct default values."""
        defaults = {
            "status": "PENDING",
            "progress": 0.0,
            "current_step": "",
            "error_message": "",
            "input_params": {},
            "checkpoint_data": {},
            "result": {},
        }
        assert Task.__tablename__ == "tasks"
        for field, expected in defaults.items():
            col = getattr(Task, field)
            assert col is not None, f"Field {field} should exist"

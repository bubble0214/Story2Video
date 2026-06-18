from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.domain.novel import NovelEntity
from app.providers.embedding import (
    DeepSeekEmbeddingProvider,
    OpenAIEmbeddingProvider,
    get_embedding_provider,
)
from app.repositories.novel import NovelRepository
from app.services.novel import NovelService


# Valid UUID for testing
NID = "550e8400-e29b-41d4-a716-446655440000"


@pytest.fixture
def repo_mock() -> MagicMock:
    return MagicMock(spec=NovelRepository)


@pytest.fixture
def embed_mock() -> AsyncMock:
    return AsyncMock(spec=["generate"])


@pytest.fixture
def svc(repo_mock: MagicMock, embed_mock: AsyncMock) -> NovelService:
    return NovelService(repo_mock, embed_mock)


def _make_mock_novel(
    novel_id: str = NID,
    title: str = "Test Novel",
    author: str = "Test Author",
    tags: str = "sci-fi,cyberpunk",
    summary: str = "A test novel summary",
    embedding: list[float] | None = None,
):
    import uuid

    return MagicMock(
        id=uuid.UUID(novel_id),
        title=title,
        author=author,
        tags=tags,
        summary=summary,
        embedding=embedding or [0.1] * 1536,
        created_at=None,
    )


# ─── Embedding provider tests ──────────────────────────────────────────────


class TestEmbeddingProviders:
    def test_get_openai_provider(self) -> None:
        provider = get_embedding_provider("openai", "sk-test")
        assert isinstance(provider, OpenAIEmbeddingProvider)

    def test_get_deepseek_provider(self) -> None:
        provider = get_embedding_provider("deepseek", "sk-test")
        assert isinstance(provider, DeepSeekEmbeddingProvider)

    def test_unknown_provider(self) -> None:
        with pytest.raises(ValueError, match="Unknown embedding provider"):
            get_embedding_provider("unknown", "key")

    @pytest.mark.asyncio
    @patch("app.providers.embedding.httpx.AsyncClient")
    async def test_openai_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"embedding": [0.1, 0.2, 0.3]}]
        }
        mock_instance = mock_client.return_value.__aenter__.return_value
        mock_instance.post.return_value = mock_response

        provider = OpenAIEmbeddingProvider("sk-test")
        result = await provider.generate("hello")
        assert result == [0.1, 0.2, 0.3]

    @pytest.mark.asyncio
    @patch("app.providers.embedding.httpx.AsyncClient")
    async def test_openai_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        mock_instance = mock_client.return_value.__aenter__.return_value
        mock_instance.post.return_value = mock_response

        provider = OpenAIEmbeddingProvider("bad-key")
        with pytest.raises(ValueError, match="OpenAI embedding failed"):
            await provider.generate("hello")

    @pytest.mark.asyncio
    @patch("app.providers.embedding.httpx.AsyncClient")
    async def test_deepseek_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"embedding": [0.4, 0.5, 0.6]}]
        }
        mock_instance = mock_client.return_value.__aenter__.return_value
        mock_instance.post.return_value = mock_response

        provider = DeepSeekEmbeddingProvider("sk-test")
        result = await provider.generate("hello")
        assert result == [0.4, 0.5, 0.6]


# ─── NovelService tests ────────────────────────────────────────────────────


class TestNovelService:
    async def test_import_success(
        self,
        svc: NovelService,
        repo_mock: MagicMock,
        embed_mock: AsyncMock,
    ) -> None:
        embed_mock.generate = AsyncMock(return_value=[0.1] * 1536)
        repo_mock.create = AsyncMock()
        repo_mock.create.return_value = _make_mock_novel()

        entity = await svc.import_novel("Test Novel", "Author", "tag1,tag2", "A summary")
        assert entity.title == "Test Novel"
        assert entity.author == "Test Author"
        assert entity.summary == "A test novel summary"
        embed_mock.generate.assert_awaited_once_with("Test Novel A summary")
        repo_mock.create.assert_awaited_once()

    async def test_import_empty_title(
        self,
        svc: NovelService,
        embed_mock: AsyncMock,
    ) -> None:
        with pytest.raises(ValueError, match="Title cannot be empty"):
            await svc.import_novel("", "Author", "", "Summary")

    async def test_import_empty_summary(
        self,
        svc: NovelService,
        embed_mock: AsyncMock,
    ) -> None:
        with pytest.raises(ValueError, match="Summary cannot be empty"):
            await svc.import_novel("Title", "Author", "", "")

    async def test_search_success(
        self,
        svc: NovelService,
        repo_mock: MagicMock,
        embed_mock: AsyncMock,
    ) -> None:
        embed_mock.generate = AsyncMock(return_value=[0.2] * 1536)
        repo_mock.search_by_embedding = AsyncMock()
        repo_mock.search_by_embedding.return_value = [
            (_make_mock_novel(title="Novel A"), 0.95),
            (_make_mock_novel(title="Novel B"), 0.85),
            (_make_mock_novel(title="Novel C"), 0.75),
        ]

        entities = await svc.search(["cyberpunk", "hacker"])
        assert len(entities) == 3
        assert entities[0].title == "Novel A"
        assert entities[0].score == 0.95
        assert entities[1].score == 0.85
        assert entities[2].score == 0.75
        embed_mock.generate.assert_awaited_once_with("cyberpunk hacker")

    async def test_search_empty_keywords(
        self,
        svc: NovelService,
    ) -> None:
        with pytest.raises(ValueError, match="Keywords cannot be empty"):
            await svc.search([])

    async def test_search_returns_top_3(
        self,
        svc: NovelService,
        repo_mock: MagicMock,
        embed_mock: AsyncMock,
    ) -> None:
        embed_mock.generate = AsyncMock(return_value=[0.2] * 1536)
        repo_mock.search_by_embedding = AsyncMock()
        repo_mock.search_by_embedding.return_value = [
            (_make_mock_novel(title=f"Novel {i}"), 1.0 - i * 0.1)
            for i in range(3)
        ]

        entities = await svc.search(["test"])
        assert len(entities) == 3

    async def test_import_and_search_integration(
        self,
        svc: NovelService,
        repo_mock: MagicMock,
        embed_mock: AsyncMock,
    ) -> None:
        embed_mock.generate = AsyncMock(return_value=[0.3] * 1536)
        repo_mock.create = AsyncMock()
        repo_mock.create.return_value = _make_mock_novel(
            title="Cyberpunk Story",
            summary="A hacker in a dystopian future",
        )
        repo_mock.search_by_embedding = AsyncMock()
        repo_mock.search_by_embedding.return_value = [
            (_make_mock_novel(title="Cyberpunk Story"), 0.92),
        ]

        entity = await svc.import_novel(
            "Cyberpunk Story",
            "Author",
            "sci-fi",
            "A hacker in a dystopian future",
        )
        assert entity.title == "Cyberpunk Story"

        results = await svc.search(["cyberpunk", "hacker"])
        assert len(results) == 1
        assert results[0].title == "Cyberpunk Story"
        assert results[0].score == 0.92
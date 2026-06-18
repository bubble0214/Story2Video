from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import uuid

import pytest

from app.repositories.api_key import ApiKeyRepository
from app.schemas.api_key import PROVIDERS
from app.services.api_key import ApiKeyService
from app.utils.encryption import decrypt_to_plaintext, encrypt_plaintext


# Valid UUIDs for testing
UID = "550e8400-e29b-41d4-a716-446655440000"
KID = "660e8400-e29b-41d4-a716-446655440001"
OTHER_UID = "770e8400-e29b-41d4-a716-446655440002"


@pytest.fixture
def repo_mock() -> MagicMock:
    return MagicMock(spec=ApiKeyRepository)


@pytest.fixture
def svc(repo_mock: MagicMock) -> ApiKeyService:
    return ApiKeyService(repo_mock)


@pytest.fixture
def decrypted_key() -> str:
    return "sk-test-api-key-12345"


@pytest.fixture
def encrypted_key(decrypted_key: str) -> str:
    return encrypt_plaintext(decrypted_key)


def _make_mock(key_id: str, user_id: str, provider: str, enc_key: str):
    return MagicMock(
        id=uuid.UUID(key_id),
        user_id=uuid.UUID(user_id),
        provider=provider,
        encrypted_key=enc_key,
        created_at=None,
    )


# ─── Encryption unit tests ──────────────────────────────────────────────────


class TestEncryption:
    def test_roundtrip(self) -> None:
        original = "sk-test-abcdef123456"
        encrypted = encrypt_plaintext(original)
        assert encrypted != original
        assert decrypt_to_plaintext(encrypted) == original

    def test_different_ciphertexts(self) -> None:
        """Each encryption call produces a unique nonce → different output."""
        key = "same-key"
        e1 = encrypt_plaintext(key)
        e2 = encrypt_plaintext(key)
        assert e1 != e2


# ─── Service unit tests ────────────────────────────────────────────────────


class TestApiKeyService:
    async def test_create(self, svc: ApiKeyService, repo_mock: MagicMock) -> None:
        repo_mock.create = AsyncMock()
        repo_mock.create.return_value = _make_mock(KID, UID, "openai", encrypt_plaintext("sk-abc"))
        entity = await svc.create(UID, "openai", "sk-abc")
        assert entity.provider == "openai"
        assert entity.decrypted_key == "sk-abc"
        repo_mock.create.assert_awaited_once()

    async def test_list_by_user(
        self, svc: ApiKeyService, repo_mock: MagicMock, encrypted_key: str
    ) -> None:
        repo_mock.list_by_user = AsyncMock()
        repo_mock.list_by_user.return_value = [
            _make_mock(KID, UID, "openai", encrypted_key),
        ]

        entities = await svc.list_by_user(UID)
        assert len(entities) == 1
        assert entities[0].provider == "openai"
        assert entities[0].decrypted_key is None

    async def test_update_key_owned(
        self, svc: ApiKeyService, repo_mock: MagicMock
    ) -> None:
        repo_mock.get_by_id = AsyncMock()
        repo_mock.get_by_id.return_value = _make_mock(KID, UID, "openai", encrypt_plaintext("old-key"))
        repo_mock.update_key = AsyncMock()
        repo_mock.update_key.return_value = _make_mock(KID, UID, "openai", encrypt_plaintext("new-key"))

        entity = await svc.update_key(KID, UID, "new-key")
        assert entity.decrypted_key == "new-key"

    async def test_update_key_not_owned(
        self, svc: ApiKeyService, repo_mock: MagicMock
    ) -> None:
        repo_mock.get_by_id = AsyncMock()
        repo_mock.get_by_id.return_value = _make_mock(KID, OTHER_UID, "openai", encrypt_plaintext("old-key"))

        with pytest.raises(ValueError, match="API key not found"):
            await svc.update_key(KID, UID, "new-key")

    async def test_delete_owned(
        self, svc: ApiKeyService, repo_mock: MagicMock
    ) -> None:
        repo_mock.get_by_id = AsyncMock()
        repo_mock.get_by_id.return_value = _make_mock(KID, UID, "openai", encrypt_plaintext("old-key"))
        repo_mock.delete = AsyncMock(return_value=True)

        await svc.delete(KID, UID)
        repo_mock.delete.assert_awaited_once()

    async def test_delete_not_owned(
        self, svc: ApiKeyService, repo_mock: MagicMock
    ) -> None:
        repo_mock.get_by_id = AsyncMock()
        repo_mock.get_by_id.return_value = _make_mock(KID, OTHER_UID, "openai", encrypt_plaintext("old-key"))

        with pytest.raises(ValueError, match="API key not found"):
            await svc.delete(KID, UID)

    async def test_get_decrypted_key_owned(
        self, svc: ApiKeyService, repo_mock: MagicMock, encrypted_key: str
    ) -> None:
        repo_mock.get_by_id = AsyncMock()
        repo_mock.get_by_id.return_value = _make_mock(KID, UID, "claude", encrypted_key)

        entity = await svc.get_decrypted_key(KID, UID)
        assert entity.decrypted_key == "sk-test-api-key-12345"
        assert entity.provider == "claude"

    @pytest.mark.parametrize("provider", PROVIDERS)
    async def test_providers_enum(
        self, provider: str, svc: ApiKeyService, repo_mock: MagicMock
    ) -> None:
        """All providers defined in schemas should be creatable."""
        repo_mock.create = AsyncMock()
        repo_mock.create.return_value = _make_mock(KID, UID, provider, encrypt_plaintext("test-key"))

        entity = await svc.create(UID, provider, "test-key")
        assert entity.provider == provider


# ─── Provider test utility tests ───────────────────────────────────────────


class TestProviderTest:
    @pytest.mark.asyncio
    @patch("app.utils.provider_test.httpx.AsyncClient")
    async def test_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_instance = mock_client.return_value.__aenter__.return_value
        mock_instance.get.return_value = mock_response

        from app.utils.provider_test import check_provider_connection

        success, msg = await check_provider_connection("openai", "sk-test")
        assert success is True
        assert "successful" in msg

    @pytest.mark.asyncio
    @patch("app.utils.provider_test.httpx.AsyncClient")
    async def test_unauthorized(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_instance = mock_client.return_value.__aenter__.return_value
        mock_instance.get.return_value = mock_response

        from app.utils.provider_test import check_provider_connection

        success, msg = await check_provider_connection("openai", "bad-key")
        assert success is False
        assert "401" in msg

    @pytest.mark.asyncio
    @patch("app.utils.provider_test.httpx.AsyncClient")
    async def test_unknown_provider(self, mock_client: MagicMock) -> None:
        from app.utils.provider_test import check_provider_connection

        success, msg = await check_provider_connection("nonexistent_provider", "key")
        assert success is False
        assert "Unknown" in msg

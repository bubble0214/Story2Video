from __future__ import annotations

from uuid import UUID

from app.domain.api_key import ApiKeyEntity
from app.repositories.api_key import ApiKeyRepository
from app.utils.encryption import decrypt_to_plaintext, encrypt_plaintext
from app.utils.provider_test import check_provider_connection


class ApiKeyService:
    def __init__(self, repo: ApiKeyRepository) -> None:
        self._repo = repo

    async def create(
        self, user_id: str, provider: str, raw_key: str,
        base_url: str | None = None, model_name: str | None = None,
        coze_space_id: str | None = None,
        coze_billing_project_id: str | None = None,
    ) -> ApiKeyEntity:
        encrypted = encrypt_plaintext(raw_key)
        obj = await self._repo.create(
            UUID(user_id), provider, encrypted, base_url, model_name,
            coze_space_id, coze_billing_project_id,
        )
        return ApiKeyEntity(
            id=str(obj.id),
            user_id=str(obj.user_id),
            provider=obj.provider,
            base_url=obj.base_url,
            model_name=obj.model_name,
            coze_space_id=obj.coze_space_id,
            coze_billing_project_id=obj.coze_billing_project_id,
            decrypted_key=raw_key,
            created_at=obj.created_at,
        )

    async def list_by_user(self, user_id: str) -> list[ApiKeyEntity]:
        objs = await self._repo.list_by_user(UUID(user_id))
        result: list[ApiKeyEntity] = []
        for obj in objs:
            result.append(
                ApiKeyEntity(
                    id=str(obj.id),
                    user_id=str(obj.user_id),
                    provider=obj.provider,
                    base_url=obj.base_url,
                    model_name=obj.model_name,
                    coze_space_id=obj.coze_space_id,
                    coze_billing_project_id=obj.coze_billing_project_id,
                    created_at=obj.created_at,
                )
            )
        return result

    async def update_key(
        self, api_key_id: str, user_id: str, new_raw_key: str,
        base_url: str | None = None, model_name: str | None = None,
        coze_space_id: str | None = None,
        coze_billing_project_id: str | None = None,
    ) -> ApiKeyEntity:
        obj = await self._repo.get_by_id(UUID(api_key_id))
        if obj is None or str(obj.user_id) != user_id:
            raise ValueError("API key not found")

        encrypted = encrypt_plaintext(new_raw_key)
        updated = await self._repo.update_key(
            UUID(api_key_id), encrypted, base_url, model_name,
            coze_space_id, coze_billing_project_id,
        )
        if updated is None:
            raise ValueError("API key not found")

        return ApiKeyEntity(
            id=str(updated.id),
            user_id=str(updated.user_id),
            provider=updated.provider,
            base_url=updated.base_url,
            model_name=updated.model_name,
            coze_space_id=updated.coze_space_id,
            coze_billing_project_id=updated.coze_billing_project_id,
            decrypted_key=new_raw_key,
            created_at=updated.created_at,
        )

    async def delete(self, api_key_id: str, user_id: str) -> None:
        obj = await self._repo.get_by_id(UUID(api_key_id))
        if obj is None or str(obj.user_id) != user_id:
            raise ValueError("API key not found")

        deleted = await self._repo.delete(UUID(api_key_id))
        if not deleted:
            raise ValueError("API key not found")

    async def get_decrypted_key(
        self, api_key_id: str, user_id: str
    ) -> ApiKeyEntity:
        obj = await self._repo.get_by_id(UUID(api_key_id))
        if obj is None or str(obj.user_id) != user_id:
            raise ValueError("API key not found")

        plain = decrypt_to_plaintext(obj.encrypted_key)
        return ApiKeyEntity(
            id=str(obj.id),
            user_id=str(obj.user_id),
            provider=obj.provider,
            base_url=obj.base_url,
            model_name=obj.model_name,
            coze_space_id=obj.coze_space_id,
            coze_billing_project_id=obj.coze_billing_project_id,
            decrypted_key=plain,
            created_at=obj.created_at,
        )

    async def get_decrypted_key_by_provider(
        self, user_id: UUID, provider: str
    ) -> ApiKeyEntity:
        obj = await self._repo.get_by_user_and_provider(user_id, provider)
        if obj is None or not obj.encrypted_key:
            raise ValueError(f"No API key found for provider '{provider}'.")

        plain = decrypt_to_plaintext(obj.encrypted_key)
        return ApiKeyEntity(
            id=str(obj.id),
            user_id=str(obj.user_id),
            provider=obj.provider,
            base_url=obj.base_url,
            model_name=obj.model_name,
            coze_space_id=obj.coze_space_id,
            coze_billing_project_id=obj.coze_billing_project_id,
            decrypted_key=plain,
            created_at=obj.created_at,
        )

    async def test_connection(
        self, provider: str, api_key: str,
        base_url: str | None = None, model_name: str | None = None,
    ) -> tuple[bool, str]:
        return await check_provider_connection(provider, api_key, base_url, model_name)

from __future__ import annotations

import logging
from typing import Any

import httpx
from cozepy import AsyncCoze, TokenAuth

from app.schemas.api_key import (
    CozeBotInfo,
    CozeDiscoverResp,
    CozeWorkspaceInfo,
)

logger = logging.getLogger(__name__)

_BILLING_ENDPOINT = "https://code.coze.cn/api/ideserver_api/project/get_or_create_billing_project"
_DEFAULT_BASE_URL = "https://api.coze.cn"
_PAGE_SIZE = 50


async def _fetch_billing_project_id(
    api_key: str, space_id: str,
) -> str | None:
    """Call Coze's internal API to get-or-create the billing project for a space.

    The endpoint is undocumented (extracted from the Coze CLI source). Returns
    None on any failure so that a single workspace's billing issue doesn't
    block the whole discovery flow.
    """
    headers = {"Authorization": f"Bearer {api_key}"}
    # Coze internal API expects space_id as int, not string
    try:
        space_id_int = int(space_id)
    except (ValueError, TypeError):
        logger.warning("cannot convert space_id %r to int", space_id)
        return None
    body: dict[str, Any] = {"space_id": space_id_int}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(_BILLING_ENDPOINT, headers=headers, json=body)
        data = resp.json()
    except Exception as exc:
        logger.warning(
            "billing project fetch failed for space %s: %s", space_id, exc,
        )
        return None

    if not isinstance(data, dict):
        logger.warning("billing project response not a dict: %r", data)
        return None

    # Coze internal API returns: {"code": 0, "data": {"project_id": <int>}, "msg": ""}
    if data.get("code") != 0:
        logger.warning(
            "billing project API returned non-zero code for space %s: %r",
            space_id, data,
        )
        return None

    inner = data.get("data")
    if isinstance(inner, dict):
        project_id = inner.get("project_id") or inner.get("billing_project_id") or inner.get("id")
    else:
        project_id = (
            data.get("billing_project_id")
            or data.get("projectId")
            or data.get("id")
        )

    if project_id is None:
        logger.warning(
            "billing project response missing id for space %s: %r",
            space_id, data,
        )
        return None

    project_id_str = str(project_id)
    if project_id_str:
        return project_id_str

    logger.warning(
        "billing project response missing id for space %s: %r", space_id, data,
    )
    return None


async def discover_coze(api_key: str, base_url: str | None) -> CozeDiscoverResp:
    """List the user's Coze workspaces, bots in each, and billing project IDs.

    Raises ValueError on auth failure or empty workspace list.
    """
    base = (base_url or _DEFAULT_BASE_URL).rstrip("/")
    client = AsyncCoze(auth=TokenAuth(token=api_key), base_url=base)

    try:
        ws_paged = await client.workspaces.list(page_num=1, page_size=_PAGE_SIZE)
    except Exception as exc:
        raise ValueError(f"Failed to list Coze workspaces: {exc}") from exc

    workspaces: list[CozeWorkspaceInfo] = []
    async with httpx.AsyncClient(timeout=15.0) as _:
        for ws in ws_paged.items:
            space_id = ws.id
            bots: list[CozeBotInfo] = []
            try:
                bot_paged = await client.bots.list(
                    space_id=space_id, page_num=1, page_size=_PAGE_SIZE,
                )
                for bot in bot_paged.items:
                    bots.append(CozeBotInfo(
                        bot_id=bot.id,
                        name=bot.name,
                        is_published=bool(bot.is_published),
                    ))
            except Exception as exc:
                logger.warning(
                    "bot list failed for space %s: %s", space_id, exc,
                )

            billing_id = await _fetch_billing_project_id(api_key, space_id)

            workspaces.append(CozeWorkspaceInfo(
                space_id=space_id,
                name=ws.name,
                billing_project_id=billing_id,
                bots=bots,
            ))

    if not workspaces:
        raise ValueError(
            "No Coze workspaces found for this PAT. Check the token scope."
        )

    return CozeDiscoverResp(workspaces=workspaces)


async def create_and_publish_bot(
    api_key: str,
    space_id: str,
    name: str,
    description: str,
    base_url: str | None,
) -> CozeBotInfo:
    """Create a new bot in the given workspace and publish it."""
    base = (base_url or _DEFAULT_BASE_URL).rstrip("/")
    client = AsyncCoze(auth=TokenAuth(token=api_key), base_url=base)

    try:
        bot = await client.bots.create(
            space_id=space_id,
            name=name,
            description=description,
        )
    except Exception as exc:
        raise ValueError(f"Failed to create Coze bot: {exc}") from exc

    bot_id = bot.id
    try:
        await client.bots.publish(bot_id=bot_id, connector_ids=["1024"])
    except Exception as exc:
        logger.warning("bot %s created but publish failed: %s", bot_id, exc)
        return CozeBotInfo(bot_id=bot_id, name=name, is_published=False)

    return CozeBotInfo(bot_id=bot_id, name=name, is_published=True)

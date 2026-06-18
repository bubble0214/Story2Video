from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.api_keys import router as api_keys_router
from app.api.v1.auth import router as auth_router
from app.api.v1.avatar import router as avatar_router
from app.api.v1.canvases import router as canvases_router
from app.api.v1.music import router as music_router
from app.api.v1.novels import router as novels_router
from app.api.v1.preferences import router as preferences_router
from app.api.v1.prompts import router as prompts_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router

router = APIRouter(prefix="/v1")
router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(users_router, prefix="/users", tags=["Users"])
router.include_router(api_keys_router, prefix="/api-keys", tags=["API Keys"])
router.include_router(novels_router, prefix="/novels", tags=["Novels"])
router.include_router(prompts_router, prefix="/prompts", tags=["Prompts"])
router.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])
router.include_router(music_router, prefix="/music", tags=["Music"])
router.include_router(avatar_router, prefix="/avatar", tags=["Avatar"])
router.include_router(canvases_router, prefix="/canvases", tags=["Canvases"])
router.include_router(preferences_router, prefix="/preferences", tags=["Preferences"])

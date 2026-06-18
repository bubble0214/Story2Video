from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.params import Depends

from redis.asyncio import Redis

from app.core.auth_sessions import RefreshTokenSessionStore
from app.core.dependencies import CurrentUserId, get_db, get_redis_client
from app.schemas.auth import (
    ChangePasswordReq,
    LoginReq,
    RefreshReq,
    RegisterReq,
)
from app.schemas.common import MessageResp, TokenPairResp
from app.services.auth import AuthService
from app.repositories.user import UserRepository
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def get_auth_service(
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis_client),
) -> AuthService:
    return AuthService(UserRepository(db), RefreshTokenSessionStore(redis))


@router.post(
    "/register",
    response_model=TokenPairResp,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    body: RegisterReq,
    svc: AuthService = Depends(get_auth_service),
) -> TokenPairResp:
    try:
        _, access, refresh = await svc.register(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return TokenPairResp(access_token=access, refresh_token=refresh)


@router.post(
    "/login",
    response_model=TokenPairResp,
    summary="Login with email and password",
)
async def login(
    body: LoginReq,
    svc: AuthService = Depends(get_auth_service),
) -> TokenPairResp:
    try:
        _, access, refresh = await svc.login(body.email, body.password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    return TokenPairResp(access_token=access, refresh_token=refresh)


@router.post(
    "/refresh",
    response_model=TokenPairResp,
    summary="Refresh access token",
)
async def refresh(
    body: RefreshReq,
    svc: AuthService = Depends(get_auth_service),
) -> TokenPairResp:
    try:
        access, new_refresh = await svc.refresh(body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    return TokenPairResp(access_token=access, refresh_token=new_refresh)


@router.post(
    "/change-password",
    response_model=MessageResp,
    summary="Change current user's password",
)
async def change_password(
    body: ChangePasswordReq,
    user_id: CurrentUserId,
    svc: AuthService = Depends(get_auth_service),
) -> MessageResp:
    try:
        await svc.change_password(user_id, body.old_password, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return MessageResp(message="Password updated successfully")

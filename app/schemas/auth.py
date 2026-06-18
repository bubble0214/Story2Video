from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr


class RegisterReq(BaseModel):
    email: EmailStr
    password: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class RefreshReq(BaseModel):
    refresh_token: str


class ChangePasswordReq(BaseModel):
    old_password: str
    new_password: str


class UserResp(BaseModel):
    id: UUID
    email: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class MessageResp(BaseModel):
    message: str


class ErrorResp(BaseModel):
    detail: str


class TokenPairResp(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

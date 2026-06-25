from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure required env vars are available for tests without a .env file."""
    monkeypatch.setenv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
    monkeypatch.setenv("JWT_SECRET_KEY", "test-jwt-secret-key-for-testing-only-32chars!")
    monkeypatch.setenv("POSTGRES_PASSWORD", "test-pg-password-32chars-long-enough-for-test")
    monkeypatch.setenv("POSTGRES_HOST", "localhost")
    monkeypatch.delenv("POSTGRES_HOST", raising=False)

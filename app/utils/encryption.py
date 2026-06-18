from __future__ import annotations

import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _derive_key() -> bytes:
    """Derive a 256-bit key from the configured encryption_key using SHA-256."""
    raw = settings.encryption_key.encode("utf-8")
    return hashlib.sha256(raw).digest()  # 32 bytes


def encrypt_plaintext(plaintext: str) -> str:
    """Encrypt plaintext with AES-256-GCM.

    Returns hex-encoded ``nonce || ciphertext``.
    """
    key = _derive_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return (nonce + ciphertext).hex()


def decrypt_to_plaintext(encrypted_hex: str) -> str:
    """Decrypt a hex-encoded ``nonce || ciphertext`` string."""
    key = _derive_key()
    data = bytes.fromhex(encrypted_hex)
    nonce, ciphertext = data[:12], data[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")

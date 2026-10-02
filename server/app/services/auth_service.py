import hashlib
import secrets

def hash_password(password: str, salt: str = None) -> str:
    """Hash a password using PBKDF2 HMAC SHA-256 with 100,000 iterations."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${key.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    """Verify a plain password against the stored salt$hash string."""
    if not hashed or '$' not in hashed:
        return False
    try:
        salt, key_hex = hashed.split('$', 1)
        new_key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return secrets.compare_digest(new_key.hex(), key_hex)
    except Exception:
        return False

import hmac
import time
from typing import Optional

AUTH_SECRET = "flatmatepay-jwt-secret-session-v1"

def create_access_token(member_id: int) -> str:
    """Create a tamper-proof signed bearer token containing member_id and issue timestamp."""
    timestamp = int(time.time())
    payload = f"{member_id}:{timestamp}"
    signature = hmac.new(AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"

def verify_access_token(token: str) -> Optional[int]:
    """Verify bearer token signature and return the authenticated member_id if valid."""
    if not token or ":" not in token:
        return None
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return None
        member_id_str, timestamp_str, sig = parts
        payload = f"{member_id_str}:{timestamp_str}"
        expected_sig = hmac.new(AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if secrets.compare_digest(sig, expected_sig):
            return int(member_id_str)
        return None
    except Exception:
        return None

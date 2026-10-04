import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Optional, Dict, Any
from app.config import settings

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

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def _b64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += '=' * padding
    return base64.urlsafe_b64decode(s.encode('ascii'))

def create_access_token(member_id: int, token_version: int = 1) -> str:
    """
    Creates a standard RFC 7519 JSON Web Token (HS256) with:
    - sub: Subject member ID
    - iat: Issued-at timestamp
    - exp: Expiration timestamp (configurable via ACCESS_TOKEN_EXPIRE_MINUTES)
    - ver: Per-user token version for immediate session invalidation
    """
    secret = settings.get_auth_secret()
    now = int(time.time())
    expire_seconds = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

    header = {
        "alg": "HS256",
        "typ": "JWT"
    }
    payload = {
        "sub": str(member_id),
        "iat": now,
        "exp": now + expire_seconds,
        "ver": token_version
    }

    header_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')

    signature = hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"

def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Decodes and cryptographically validates a JWT token.
    Raises ValueError with descriptive reason if invalid, expired, or malformed.
    """
    if not token or not isinstance(token, str):
        raise ValueError("Missing token")

    parts = token.strip().split('.')
    if len(parts) != 3:
        raise ValueError("Malformed token: expected 3 parts")

    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')

    secret = settings.get_auth_secret()
    expected_sig = hmac.new(secret.encode('utf-8'), signing_input, hashlib.sha256).digest()
    
    try:
        actual_sig = _b64url_decode(sig_b64)
    except Exception:
        raise ValueError("Invalid signature encoding")

    if not secrets.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid token signature")

    try:
        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))
    except Exception:
        raise ValueError("Invalid token payload")

    # Validate expiration
    exp = payload.get("exp")
    if exp is None:
        raise ValueError("Token missing expiration claim")
    
    if int(time.time()) > int(exp):
        raise ValueError("Token has expired")

    # Validate subject
    sub = payload.get("sub")
    if not sub:
        raise ValueError("Token missing subject claim")

    return payload

def verify_access_token(token: str) -> Optional[int]:
    """
    Convenience wrapper returning member_id as int if token is valid and not expired,
    or None otherwise.
    """
    try:
        payload = decode_access_token(token)
        return int(payload["sub"])
    except Exception:
        return None

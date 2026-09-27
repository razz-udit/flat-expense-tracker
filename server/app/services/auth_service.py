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

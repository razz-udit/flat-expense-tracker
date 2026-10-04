from typing import Optional
from fastapi import Depends, Header, Query, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.member import Member
from app.services.auth_service import decode_access_token

def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> Member:
    """
    Authoritative server-side authentication dependency.
    Extracts and cryptographically validates the Bearer token from header or query param.
    Validates token signature, expiration (exp), subject (sub), and user token_version.
    Strictly rejects forged identity, expired tokens, and untrusted headers.
    """
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split("Bearer ", 1)[1].strip()
    elif token:
        raw_token = token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: Missing or invalid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(raw_token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        member_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication payload: member ID is missing or invalid.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    member = db.query(Member).filter(Member.id == member_id, Member.is_active == True).first()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found or deactivated.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_ver = payload.get("ver")
    if token_ver is not None and getattr(member, "token_version", 1) != token_ver:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired: Account security credentials were updated. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return member

def get_optional_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
) -> Optional[Member]:
    """Returns the authenticated member if a valid token is provided, or None otherwise."""
    if not ((authorization and authorization.startswith("Bearer ")) or token):
        return None
    try:
        return get_current_user(authorization=authorization, token=token, db=db)
    except HTTPException:
        return None

def require_admin(
    current_user: Member = Depends(get_current_user)
) -> Member:
    """
    Enforces authoritative admin role authorization.
    Rejects any non-admin member with HTTP 403 Forbidden.
    """
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin privileges are required to perform this action."
        )
    return current_user

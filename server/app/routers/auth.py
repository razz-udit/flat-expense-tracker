import secrets
import base64
import json
import hashlib
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.config import settings
from app.database import get_db
from app.models.member import Member
from app.schemas.auth import (
    LoginRequest, 
    SignUpRequest,
    GoogleAuthRequest,
    LoginResponse, 
    SetPasswordRequest,
    ChangePasswordRequest, 
    VerifyAdminRequest, 
    AdminResetPasswordRequest,
    ClaimAccountRequest
)
from app.schemas.member import MemberOut
from app.services.auth_service import hash_password, verify_password, create_access_token
from app.services.audit_service import log_audit
from app.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def find_member_by_identifier(ident: str, db: Session) -> Optional[Member]:
    clean_ident = ident.strip()
    query = db.query(Member).filter(Member.is_active == True)

    member = None
    if clean_ident.isdigit():
        member = query.filter(Member.id == int(clean_ident)).first()

    if not member:
        member = query.filter(func.lower(Member.username) == clean_ident.lower()).first()

    if not member:
        member = query.filter(func.lower(Member.email) == clean_ident.lower()).first()

    if not member:
        member = query.filter(func.lower(Member.name) == clean_ident.lower()).first()

    return member

def verify_google_token_with_api(credential: Optional[str] = None, access_token: Optional[str] = None) -> dict:
    """
    Cryptographically verifies Google authentication token using Google's public OAuth2 API:
    - ID Token (Google Identity Services): https://oauth2.googleapis.com/tokeninfo?id_token={credential}
    - Access Token: https://www.googleapis.com/oauth2/v3/userinfo
    Returns verified dict with keys: 'email', 'name', 'avatar_url', 'google_id'.
    """
    if not credential and not access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authentication failed: Neither credential ID token nor access token was provided."
        )

    # Allow mock test tokens ONLY when explicitly configured in test environment
    if credential and credential.startswith("test_mock_token_"):
        if settings.APP_ENV != "test":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Test mock credentials are strictly forbidden outside of test environment (APP_ENV=test)."
            )
        parts = credential.split("test_mock_token_")[1].split("|")
        return {
            "email": parts[0].strip().lower(),
            "name": parts[1] if len(parts) > 1 else parts[0].split("@")[0],
            "avatar_url": parts[2] if len(parts) > 2 else None,
            "google_id": parts[3] if len(parts) > 3 else "test_google_id_123"
        }

    # 1. Verify Google ID token via Google's tokeninfo endpoint
    if credential:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.request.quote(credential)}"
        req = urllib.request.Request(url, headers={"User-Agent": "FlatMatePay/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google authentication failed: Token was rejected by Google identity service."
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google authentication service temporarily unreachable. Please try again later."
            )

        # Validate Audience if configured
        if settings.GOOGLE_CLIENT_ID:
            aud = data.get("aud")
            if aud != settings.GOOGLE_CLIENT_ID:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Google authentication failed: Token audience mismatch."
                )

        email = data.get("email")
        email_verified = data.get("email_verified")
        if not email or str(email_verified).lower() not in ("true", "1"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google authentication failed: Google account email address is not verified."
            )

        return {
            "email": email.strip().lower(),
            "name": (data.get("name") or email.split("@")[0]).strip(),
            "avatar_url": data.get("picture"),
            "google_id": data.get("sub")
        }

    # 2. Verify Google Access Token via Google's userinfo endpoint
    if access_token:
        url = "https://www.googleapis.com/oauth2/v3/userinfo"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "FlatMatePay/1.0",
                "Authorization": f"Bearer {access_token}"
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google access token rejected by Google identity service."
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Google authentication service temporarily unreachable. Please try again later."
            )

        email = data.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google authentication failed: Email could not be retrieved from Google account."
            )

        return {
            "email": email.strip().lower(),
            "name": (data.get("name") or email.split("@")[0]).strip(),
            "avatar_url": data.get("picture"),
            "google_id": data.get("sub")
        }

    raise HTTPException(status_code=400, detail="Invalid Google token.")

@router.post("/google", response_model=LoginResponse)
def google_auth(data: GoogleAuthRequest, db: Session = Depends(get_db)):
    # 1. Authenticate cryptographically using Google API
    verified = verify_google_token_with_api(credential=data.credential, access_token=data.access_token)

    clean_email = verified["email"]
    clean_name = verified["name"]
    avatar_url = verified["avatar_url"]
    google_id = verified["google_id"]
    clean_upi = data.upi_id.strip() if data.upi_id and data.upi_id.strip() else None

    # 2. Check for deactivated accounts first
    if google_id:
        deactivated = db.query(Member).filter(Member.google_id == google_id, Member.is_active == False).first()
        if deactivated:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This flat account has been deactivated. Please contact your flat administrator."
            )
    if clean_email:
        deactivated = db.query(Member).filter(func.lower(Member.email) == clean_email, Member.is_active == False).first()
        if deactivated:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This flat account has been deactivated. Please contact your flat administrator."
            )

    # 3. Search for existing member ONLY by google_id or verified email (NEVER by name)
    member = None
    if google_id:
        member = db.query(Member).filter(Member.google_id == google_id, Member.is_active == True).first()

    if not member and clean_email:
        member = db.query(Member).filter(func.lower(Member.email) == clean_email, Member.is_active == True).first()

    if member:
        # Existing member: link google info securely
        if google_id and not member.google_id:
            member.google_id = google_id
        if avatar_url and not member.avatar_url:
            member.avatar_url = avatar_url
        if clean_email and (not member.email or "@flat.local" in member.email):
            member.email = clean_email
        if clean_upi and not member.upi_id:
            member.upi_id = clean_upi
        db.commit()
        db.refresh(member)

        log_audit(db, "auth.google_login", member_id=member.id, details={"name": member.name, "email": member.email})

        token = create_access_token(member.id, getattr(member, "token_version", 1))
        return LoginResponse(
            success=True,
            message=f"Welcome back, {member.name}! Authenticated via Google.",
            member=MemberOut.model_validate(member),
            token=token
        )

    # 4. New member signing up with Google
    if not clean_upi or "@" not in clean_upi or len(clean_upi) < 3:
        raise HTTPException(
            status_code=400,
            detail="NEEDS_UPI_ID: A valid UPI ID is mandatory for receiving flat settlements (e.g. name@okhdfcbank or 9876543210@paytm)."
        )

    active_count = db.query(Member).filter(Member.is_active == True).count()
    is_admin = (active_count == 0)

    new_member = Member(
        name=clean_name,
        email=clean_email,
        upi_id=clean_upi,
        google_id=google_id,
        avatar_url=avatar_url,
        is_active=True,
        is_admin=is_admin,
        token_version=1
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    log_audit(db, "auth.google_signup", member_id=new_member.id, details={"name": new_member.name, "email": new_member.email})

    token = create_access_token(new_member.id, new_member.token_version)
    return LoginResponse(
        success=True,
        message=f"Welcome to the flat, {new_member.name}! Registered via Google.",
        member=MemberOut.model_validate(new_member),
        token=token
    )

@router.post("/signup", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
@router.post("/register", response_model=LoginResponse, status_code=status.HTTP_201_CREATED)
def signup(data: SignUpRequest, db: Session = Depends(get_db)):
    clean_name = data.name.strip()
    clean_email = data.email.strip() if data.email and data.email.strip() else None
    clean_upi = data.upi_id.strip() if data.upi_id and data.upi_id.strip() else None
    pwd = data.password.strip()

    if len(clean_name) < 2:
        raise HTTPException(status_code=400, detail="Name must be at least 2 characters long.")

    if len(pwd) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long.")

    if not clean_upi or "@" not in clean_upi or len(clean_upi) < 3:
        raise HTTPException(
            status_code=400, 
            detail="A valid UPI ID is mandatory for receiving flat settlements (e.g. name@okhdfcbank or 9876543210@paytm)."
        )

    # Check if a member with this email or name already exists
    query = db.query(Member).filter(Member.is_active == True)
    existing = None
    if clean_email:
        existing = query.filter(func.lower(Member.email) == clean_email.lower()).first()
    if not existing:
        existing = query.filter(func.lower(Member.name) == clean_name.lower()).first()

    if existing:
        if existing.password_hash:
            raise HTTPException(
                status_code=400, 
                detail=f"An account for '{existing.name}' already exists. Please go to the Sign In tab."
            )
        # If the member was pre-added without password, claim and activate it
        existing.name = clean_name
        if clean_email:
            existing.email = clean_email
        if clean_upi:
            existing.upi_id = clean_upi
        existing.password_hash = hash_password(pwd)
        existing.token_version = getattr(existing, "token_version", 1)
        db.commit()
        db.refresh(existing)

        log_audit(db, "auth.signup_claimed", member_id=existing.id, details={"name": existing.name})

        token = create_access_token(existing.id, existing.token_version)
        return LoginResponse(
            success=True,
            message=f"Welcome to the flat, {existing.name}! Your account has been registered.",
            member=MemberOut.model_validate(existing),
            token=token
        )

    active_count = db.query(Member).filter(Member.is_active == True).count()
    is_admin = (active_count == 0)

    new_member = Member(
        name=clean_name,
        email=clean_email or f"{clean_name.lower().replace(' ', '')}@flat.local",
        upi_id=clean_upi,
        password_hash=hash_password(pwd),
        is_active=True,
        is_admin=is_admin,
        token_version=1
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    log_audit(db, "auth.signup", member_id=new_member.id, details={"name": new_member.name})

    token = create_access_token(new_member.id, new_member.token_version)
    return LoginResponse(
        success=True,
        message=f"Welcome to the flat, {new_member.name}! Your account has been registered.",
        member=MemberOut.model_validate(new_member),
        token=token
    )

@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    ident = data.identifier.strip()
    pwd = data.password.strip()

    # Disambiguate duplicate member names on login
    if not ident.isdigit() and "@" not in ident:
        matching_by_name = db.query(Member).filter(
            func.lower(Member.name) == ident.lower(),
            Member.is_active == True
        ).all()
        if len(matching_by_name) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Multiple flat members share the name '{ident}'. Please log in using your unique Email or Member ID."
            )

    member = find_member_by_identifier(ident, db)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No active flat member found with this ID, Name, or Email."
        )

    # Never silently assign password during login
    if not member.password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password has not been created for this account yet. Please claim your account using the invitation link provided by your flat admin."
        )

    if not verify_password(pwd, member.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again."
        )

    token = create_access_token(member.id, getattr(member, "token_version", 1))

    log_audit(db, "auth.login", member_id=member.id, details={"name": member.name})

    return LoginResponse(
        success=True,
        message=f"Welcome back, {member.name}!",
        member=MemberOut.model_validate(member),
        token=token
    )

@router.post("/claim", response_model=LoginResponse)
def claim_account(data: ClaimAccountRequest, db: Session = Depends(get_db)):
    clean_token = data.token.strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="Claim token is required.")

    token_hash = hashlib.sha256(clean_token.encode("utf-8")).hexdigest()
    member = db.query(Member).filter(
        Member.claim_token_hash == token_hash,
        Member.is_active == True
    ).first()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid invitation token or account does not exist."
        )

    if member.claim_token_expires_at and member.claim_token_expires_at < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has expired. Please ask your flat administrator to generate a new invite link."
        )

    pwd = data.password.strip()
    if len(pwd) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters long.")

    member.password_hash = hash_password(pwd)
    # Single-use: immediately invalidate token
    member.claim_token_hash = None
    member.claim_token_expires_at = None
    # Invalidate any old sessions
    member.token_version = getattr(member, "token_version", 1) + 1

    db.commit()
    db.refresh(member)

    log_audit(db, "member.claimed", member_id=member.id, details={"member_name": member.name})

    token = create_access_token(member.id, member.token_version)
    return LoginResponse(
        success=True,
        message=f"Welcome to the flat, {member.name}! Your account has been claimed and password established.",
        member=MemberOut.model_validate(member),
        token=token
    )

@router.post("/set-password", response_model=LoginResponse)
def set_password(data: SetPasswordRequest, db: Session = Depends(get_db)):
    # Direct password setting by name/ID alone is disabled for security
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Direct password setting by identifier is disabled for security. Please use the one-time invite claim link provided by your flat administrator (POST /api/auth/claim)."
    )

@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only the member themselves or flat admin can change this account's password
    if current_user.id != data.member_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: You can only change your own password."
        )

    target_member = db.query(Member).filter(Member.id == data.member_id, Member.is_active == True).first()
    if not target_member:
        raise HTTPException(status_code=404, detail="Member not found.")

    # If the user is changing their own password, verify current password
    if current_user.id == target_member.id and target_member.password_hash:
        if not verify_password(data.current_password, target_member.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")

    target_member.password_hash = hash_password(data.new_password.strip())
    # Invalidate old sessions by incrementing token_version
    target_member.token_version = getattr(target_member, "token_version", 1) + 1
    db.commit()

    log_audit(db, "auth.password_changed", member_id=target_member.id, details={"changed_by": current_user.id})

    return {"success": True, "message": "Password updated successfully! Old sessions have been invalidated."}

@router.post("/verify-admin")
def verify_admin(data: VerifyAdminRequest, db: Session = Depends(get_db)):
    admin = db.query(Member).filter(Member.is_admin == True, Member.is_active == True).first()
    if not admin:
        raise HTTPException(status_code=404, detail="No flat admin configured.")

    if not admin.password_hash:
        raise HTTPException(
            status_code=400, 
            detail=f"Flat Admin ({admin.name}) has not set a password yet."
        )

    if not verify_password(data.admin_password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect Flat Admin password.")

    return {"success": True, "message": "Flat Admin unlocked successfully!"}

@router.post("/admin-reset-password")
def admin_reset_password(
    data: AdminResetPasswordRequest, 
    admin_caller: Member = Depends(require_admin),
    db: Session = Depends(get_db)
):
    if admin_caller.password_hash and not verify_password(data.admin_password, admin_caller.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect Admin password.")

    target = db.query(Member).filter(Member.id == data.target_member_id, Member.is_active == True).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target member not found.")

    target.password_hash = hash_password(data.new_password.strip())
    # Invalidate all existing sessions of the target member
    target.token_version = getattr(target, "token_version", 1) + 1
    db.commit()

    log_audit(db, "auth.admin_reset_password", member_id=target.id, details={"admin_id": admin_caller.id})

    return {"success": True, "message": f"Password for {target.name} has been reset successfully! Old sessions invalidated."}

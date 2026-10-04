import secrets
import base64
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
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
    AdminResetPasswordRequest
)
from app.schemas.member import MemberOut
from app.services.auth_service import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

def find_member_by_identifier(ident: str, db: Session) -> Member:
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

def parse_google_jwt(credential: str) -> dict:
    try:
        parts = credential.strip().split(".")
        if len(parts) < 2:
            return {}
        payload_b64 = parts[1]
        rem = len(payload_b64) % 4
        if rem > 0:
            payload_b64 += "=" * (4 - rem)
        return json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
    except Exception:
        return {}

@router.post("/google", response_model=LoginResponse)
def google_auth(data: GoogleAuthRequest, db: Session = Depends(get_db)):
    email = data.email
    name = data.name
    avatar_url = data.avatar_url
    google_id = data.google_id

    # If Google ID token JWT was provided, decode its payload
    if data.credential:
        payload = parse_google_jwt(data.credential)
        email = payload.get("email") or email
        name = payload.get("name") or name
        avatar_url = payload.get("picture") or avatar_url
        google_id = payload.get("sub") or google_id

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Google authentication failed: Email address could not be verified from Google account."
        )

    clean_email = email.strip().lower()
    clean_name = (name or clean_email.split("@")[0]).strip()
    clean_upi = data.upi_id.strip() if data.upi_id and data.upi_id.strip() else None

    # 1. Search for existing member: google_id -> email -> name
    member = None
    if google_id:
        member = db.query(Member).filter(Member.google_id == google_id, Member.is_active == True).first()

    if not member and clean_email:
        member = db.query(Member).filter(func.lower(Member.email) == clean_email, Member.is_active == True).first()

    if not member and clean_name:
        member = db.query(Member).filter(func.lower(Member.name) == clean_name.lower(), Member.is_active == True).first()

    if member:
        # Existing member: Link Google info
        if google_id and not member.google_id:
            member.google_id = google_id
        if avatar_url and not member.avatar_url:
            member.avatar_url = avatar_url
        if clean_email and not member.email:
            member.email = clean_email
        if clean_upi and not member.upi_id:
            member.upi_id = clean_upi
        db.commit()
        db.refresh(member)

        token = create_access_token(member.id)
        return LoginResponse(
            success=True,
            message=f"Welcome back, {member.name}! Signed in via Google.",
            member=MemberOut.model_validate(member),
            token=token
        )

    # 2. New member signing up with Google
    if not clean_upi or "@" not in clean_upi or len(clean_upi) < 3:
        raise HTTPException(
            status_code=400,
            detail="NEEDS_UPI_ID: A valid UPI ID is mandatory for receiving flat settlements (e.g. name@okhdfcbank or 9876543210@paytm)."
        )

    new_member = Member(
        name=clean_name,
        email=clean_email,
        upi_id=clean_upi,
        google_id=google_id,
        avatar_url=avatar_url,
        is_active=True
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    token = create_access_token(new_member.id)
    return LoginResponse(
        success=True,
        message=f"Welcome to the flat, {new_member.name}! Registered with Google.",
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

    # 1. Check if a member with this exact name or email already exists
    query = db.query(Member).filter(Member.is_active == True)
    existing = query.filter(func.lower(Member.name) == clean_name.lower()).first()
    if not existing and clean_email:
        existing = query.filter(func.lower(Member.email) == clean_email.lower()).first()

    if existing:
        if existing.password_hash:
            raise HTTPException(
                status_code=400, 
                detail=f"An account for '{existing.name}' already exists. Please go to the Sign In tab."
            )
        # If the member was added by admin with no password yet, claim and activate it
        existing.name = clean_name
        if clean_email:
            existing.email = clean_email
        if clean_upi:
            existing.upi_id = clean_upi
        existing.password_hash = hash_password(pwd)
        db.commit()
        token = create_access_token(existing.id)
        return LoginResponse(
            success=True,
            message=f"Welcome to the flat, {existing.name}! Your account has been registered.",
            member=MemberOut.model_validate(existing),
            token=token
        )

    # 2. Create a brand new active Member dynamically
    new_member = Member(
        name=clean_name,
        email=clean_email or f"{clean_name.lower().replace(' ', '')}@flat.local",
        upi_id=clean_upi,
        password_hash=hash_password(pwd),
        is_active=True
    )
    db.add(new_member)
    db.commit()
    db.refresh(new_member)

    token = create_access_token(new_member.id)
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

    member = find_member_by_identifier(ident, db)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No active flat member found with this ID, Name, or Email. If you are new, please use the 'Sign Up' tab to create your account."
        )

    # If the member has never set a password yet, securely set it on their first login
    if not member.password_hash:
        member.password_hash = hash_password(pwd)
        db.commit()
        token = create_access_token(member.id)
        return LoginResponse(
            success=True,
            message=f"Welcome, {member.name}! Your account password has been set.",
            member=MemberOut.model_validate(member),
            token=token
        )

    # If password is already set, verify securely
    if not verify_password(pwd, member.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password. Please try again."
        )

    # Generate session token
    token = create_access_token(member.id)

    return LoginResponse(
        success=True,
        message=f"Welcome back, {member.name}!",
        member=MemberOut.model_validate(member),
        token=token
    )

@router.post("/set-password", response_model=LoginResponse)
def set_password(data: SetPasswordRequest, db: Session = Depends(get_db)):
    member = find_member_by_identifier(data.identifier, db)
    if not member:
        raise HTTPException(
            status_code=404, 
            detail="Member not found. If you are creating a new account, please use the 'Sign Up' tab."
        )

    if member.password_hash:
        raise HTTPException(
            status_code=400, 
            detail="A password is already set for this account. Please sign in with your password or use Settings to change it."
        )

    member.password_hash = hash_password(data.new_password.strip())
    db.commit()
    token = create_access_token(member.id)

    return LoginResponse(
        success=True,
        message=f"Password set successfully! Welcome, {member.name}!",
        member=MemberOut.model_validate(member),
        token=token
    )

@router.post("/change-password")
def change_password(data: ChangePasswordRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == data.member_id, Member.is_active == True).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.password_hash and not verify_password(data.current_password, member.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    member.password_hash = hash_password(data.new_password)
    db.commit()

    return {"success": True, "message": "Password updated successfully!"}

@router.post("/verify-admin")
def verify_admin(data: VerifyAdminRequest, db: Session = Depends(get_db)):
    admin = db.query(Member).filter(Member.is_active == True).order_by(Member.id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="No flat admin found")

    if not admin.password_hash:
        raise HTTPException(
            status_code=400, 
            detail=f"Flat Admin ({admin.name}) has not set a password yet. Please ask {admin.name} to sign in and set a password."
        )

    if not verify_password(data.admin_password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect Flat Admin password.")

    return {"success": True, "message": "Flat Admin unlocked successfully!"}

@router.post("/admin-reset-password")
def admin_reset_password(data: AdminResetPasswordRequest, db: Session = Depends(get_db)):
    admin = db.query(Member).filter(Member.id == data.admin_member_id, Member.is_active == True).first()
    first_member = db.query(Member).filter(Member.is_active == True).order_by(Member.id).first()
    if not admin or not first_member or admin.id != first_member.id:
        raise HTTPException(status_code=403, detail="Only the Flat Admin can reset member passwords.")

    if admin.password_hash and not verify_password(data.admin_password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect Admin password.")

    target = db.query(Member).filter(Member.id == data.target_member_id, Member.is_active == True).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target member not found.")

    target.password_hash = hash_password(data.new_password.strip())
    db.commit()

    return {"success": True, "message": f"Password for {target.name} has been reset successfully!"}

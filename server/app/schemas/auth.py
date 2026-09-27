from typing import Optional
from pydantic import BaseModel, Field
from app.schemas.member import MemberOut

class LoginRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=150, description="Member ID, username, email, or full name")
    password: str = Field(..., min_length=1, max_length=100)

class SignUpRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Full Name of flatmate")
    email: Optional[str] = Field(None, max_length=150, description="Email address")
    upi_id: str = Field(..., min_length=3, max_length=100, description="Mandatory UPI ID for flat settlements (e.g. name@upi)")
    password: str = Field(..., min_length=4, max_length=100)

class LoginResponse(BaseModel):
    success: bool
    message: str
    member: MemberOut
    token: Optional[str] = None

class SetPasswordRequest(BaseModel):
    identifier: str = Field(..., min_length=1, max_length=150, description="Member ID, username, email, or full name")
    new_password: str = Field(..., min_length=4, max_length=100)

class ChangePasswordRequest(BaseModel):
    member_id: int
    current_password: str
    new_password: str = Field(..., min_length=4, max_length=100)

class VerifyAdminRequest(BaseModel):
    admin_password: str = Field(..., min_length=1, max_length=100)

class AdminResetPasswordRequest(BaseModel):
    admin_member_id: int
    admin_password: str
    target_member_id: int
    new_password: str = Field(..., min_length=4, max_length=100)

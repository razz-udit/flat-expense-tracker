from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class MemberBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = Field(None, max_length=150)
    upi_id: Optional[str] = Field(None, max_length=100)

class MemberCreate(MemberBase):
    pass

class MemberUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = Field(None, max_length=150)
    upi_id: Optional[str] = Field(None, max_length=100)
    is_active: Optional[bool] = None

class MemberOut(MemberBase):
    id: int
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MemberConfigItem(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    upi_id: Optional[str] = None

class ConfigureFlatSizeRequest(BaseModel):
    count: int = Field(..., ge=2, le=30)
    members: Optional[list[MemberConfigItem]] = None

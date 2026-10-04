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
    is_admin: Optional[bool] = None

class MemberOut(MemberBase):
    id: int
    is_active: bool
    is_admin: bool = False
    avatar_url: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

from decimal import Decimal
from pydantic import model_validator

class MemberConfigItem(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    upi_id: Optional[str] = None

class ConfigureFlatSizeRequest(BaseModel):
    count: int = Field(..., ge=2, le=30)
    members: Optional[list[MemberConfigItem]] = None

    @model_validator(mode="after")
    def validate_count_matches(self):
        if self.members and len(self.members) != self.count:
            raise ValueError(
                f"Validation error: The provided member list has {len(self.members)} items, but requested flat count is {self.count}. They must match exactly."
            )
        return self

class LeavePreviewResponse(BaseModel):
    member_id: int
    member_name: str
    net_balance: Decimal
    amount_owed: Decimal = Decimal("0.00")
    amount_receivable: Decimal = Decimal("0.00")
    active_recurring_count: int = 0
    unresolved_disputes_count: int = 0
    can_leave_cleanly: bool = True
    can_leave: Optional[bool] = True
    outstanding_debts: Optional[Decimal] = Decimal("0.00")
    outstanding_credits: Optional[Decimal] = Decimal("0.00")
    message: str

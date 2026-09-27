from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.schemas.member import MemberOut

class PaymentBase(BaseModel):
    from_member: int
    to_member: int
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    payment_date: date
    status: str = Field("Paid", pattern="^(Pending|Paid)$")
    payment_method: Optional[str] = Field("UPI", max_length=50, description="UPI Gateway, UPI QR, Cash, Bank Transfer")
    transaction_reference: Optional[str] = Field(None, max_length=100, description="UTR or Bank Reference number")
    notes: Optional[str] = None

class PaymentCreate(PaymentBase):
    @model_validator(mode="after")
    def validate_members(self):
        if self.from_member == self.to_member:
            raise ValueError("Sender and receiver cannot be the same member.")
        return self

class PaymentUpdate(BaseModel):
    status: Optional[str] = Field(None, pattern="^(Pending|Paid)$")
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    payment_method: Optional[str] = None
    transaction_reference: Optional[str] = None
    payment_date: Optional[date] = None
    notes: Optional[str] = None

class PaymentOut(PaymentBase):
    id: int
    verified_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    payer: Optional[MemberOut] = None
    receiver: Optional[MemberOut] = None
    upi_link: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

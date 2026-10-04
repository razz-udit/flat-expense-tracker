from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.schemas.member import MemberOut
from app.schemas.category import CategoryOut

class ExpenseSplitInput(BaseModel):
    member_id: int
    amount: Optional[Decimal] = None # Optional for equal split, required for exact/custom
    percentage: Optional[Decimal] = None # Optional, used for percentage split
    shares: Optional[Decimal] = None # Optional, used for shares/ratio split

class ExpenseSplitOut(BaseModel):
    id: int
    expense_id: int
    member_id: int
    amount: Decimal
    shares: Optional[Decimal] = None
    percentage: Optional[Decimal] = None
    member: Optional[MemberOut] = None
    model_config = ConfigDict(from_attributes=True)

class ExpenseBase(BaseModel):
    category_id: Optional[int] = None
    category_name: Optional[str] = Field(None, max_length=100)
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    paid_by: int
    description: Optional[str] = Field(None, max_length=255)
    expense_date: date
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    receipt_url: Optional[str] = None
    payment_method: Optional[str] = "UPI"
    verification_status: Optional[str] = "Pending Confirmation"
    confirmed_by: Optional[str] = None
    split_type: str = Field("equal", pattern="^(equal|custom|exact|percentage|shares)$")
    notes: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    splits: Optional[List[ExpenseSplitInput]] = None
    member_ids: Optional[List[int]] = None # For quick equal split

    @model_validator(mode="after")
    def validate_category(self):
        if not self.category_id and not (self.category_name and self.category_name.strip()):
            raise ValueError("Either category_id or a dynamic category_name must be provided.")
        return self

    @model_validator(mode="after")
    def validate_splits(self):
        if self.split_type in ("custom", "exact"):
            if not self.splits or len(self.splits) == 0:
                raise ValueError("Custom/exact split requires at least one split entry with member_id and amount.")
            for s in self.splits:
                if s.amount is None or s.amount <= 0:
                    raise ValueError(f"Split amount for member {s.member_id} must be greater than 0.")
            total_split = sum(s.amount for s in self.splits)
            if round(total_split, 2) != round(self.amount, 2):
                raise ValueError(f"Sum of splits (₹{total_split}) must equal expense amount (₹{self.amount}).")
        elif self.split_type == "percentage":
            if not self.splits or len(self.splits) == 0:
                raise ValueError("Percentage split requires at least one split entry.")
            # If amounts are already provided by client:
            has_amounts = all(s.amount is not None for s in self.splits)
            has_pcts = any(s.percentage is not None for s in self.splits)
            if has_pcts:
                total_pct = sum(s.percentage or Decimal("0.00") for s in self.splits)
                if abs(total_pct - Decimal("100.00")) > Decimal("0.5"):
                    raise ValueError(f"Sum of split percentages ({total_pct}%) must equal 100%.")
            elif has_amounts:
                total_split = sum(s.amount for s in self.splits if s.amount is not None)
                if round(total_split, 2) != round(self.amount, 2):
                    raise ValueError(f"Sum of splits (₹{total_split}) must equal expense amount (₹{self.amount}).")
        elif self.split_type == "shares":
            if not self.splits or len(self.splits) == 0:
                raise ValueError("Shares split requires at least one split entry.")
            has_amounts = all(s.amount is not None for s in self.splits)
            has_shares = any(s.shares is not None for s in self.splits)
            if has_shares:
                total_sh = sum(s.shares or Decimal("0.00") for s in self.splits)
                if total_sh <= 0:
                    raise ValueError("Total shares must be greater than 0.")
            elif has_amounts:
                total_split = sum(s.amount for s in self.splits if s.amount is not None)
                if round(total_split, 2) != round(self.amount, 2):
                    raise ValueError(f"Sum of splits (₹{total_split}) must equal expense amount (₹{self.amount}).")
        else: # equal split
            members = self.member_ids if self.member_ids else ([s.member_id for s in self.splits] if self.splits else [])
            if not members or len(members) == 0:
                raise ValueError("Equal split requires at least one participating member.")
        return self

class ExpenseUpdate(BaseModel):
    category_id: Optional[int] = None
    category_name: Optional[str] = Field(None, max_length=100)
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    paid_by: Optional[int] = None
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    expense_date: Optional[date] = None
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    receipt_url: Optional[str] = None
    payment_method: Optional[str] = None
    verification_status: Optional[str] = None
    confirmed_by: Optional[str] = None
    split_type: Optional[str] = Field(None, pattern="^(equal|custom|exact|percentage|shares)$")
    notes: Optional[str] = None
    splits: Optional[List[ExpenseSplitInput]] = None
    member_ids: Optional[List[int]] = None

class ExpenseEvaluationInput(BaseModel):
    action: str = Field(..., pattern="^(confirm|dispute)$")
    notes: Optional[str] = None

class ExpenseOut(BaseModel):
    id: int
    category_id: int
    amount: Decimal
    paid_by: int
    description: str
    expense_date: date
    billing_period_start: Optional[date] = None
    billing_period_end: Optional[date] = None
    receipt_url: Optional[str] = None
    payment_method: Optional[str] = "UPI"
    verification_status: Optional[str] = "Pending Confirmation"
    confirmed_by: Optional[str] = None
    split_type: str
    recurring_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    category: Optional[CategoryOut] = None
    payer: Optional[MemberOut] = None
    splits: List[ExpenseSplitOut] = []
    model_config = ConfigDict(from_attributes=True)

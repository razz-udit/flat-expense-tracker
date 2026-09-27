from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

class CategoryBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    monthly_budget_per_member: Optional[Decimal] = Field(None, ge=0, decimal_places=2, description="Target monthly budget allocated per flat member")

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    monthly_budget_per_member: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    is_active: Optional[bool] = None

class CategoryOut(CategoryBase):
    id: int
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class MemberBudgetContribution(BaseModel):
    member_id: int
    member_name: str
    upi_id: Optional[str] = None
    amount_paid: Decimal
    target_budget: Optional[Decimal] = None
    diff_from_target: Decimal # > 0 means overpaid / paid extra, < 0 means underpaid / deficit

class BudgetEqualizationTransfer(BaseModel):
    from_member_id: int
    from_member_name: str
    to_member_id: int
    to_member_name: str
    to_member_upi: Optional[str] = None
    amount: Decimal
    reason: str
    upi_link: Optional[str] = None

class CategoryBudgetStatus(BaseModel):
    category_id: int
    category_name: str
    monthly_budget_per_member: Optional[Decimal] = None
    total_budget: Optional[Decimal] = None
    total_spent: Decimal
    members_count: int
    member_contributions: List[MemberBudgetContribution]
    equalization_transfers: List[BudgetEqualizationTransfer]

class EqualizeBudgetRequest(BaseModel):
    category_id: int
    from_member_id: int
    to_member_id: int
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    payment_method: Optional[str] = "UPI"
    transaction_reference: Optional[str] = None
    notes: Optional[str] = None

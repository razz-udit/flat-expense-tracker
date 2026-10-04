from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Any
import json
from pydantic import BaseModel, Field, ConfigDict, field_validator
from app.schemas.member import MemberOut
from app.schemas.category import CategoryOut

class RecurringBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    category_id: int
    amount: Decimal = Field(..., gt=0, decimal_places=2)
    paid_by: int
    split_type: str = Field("equal", pattern="^(equal|custom|percentage|shares)$")
    split_members: Optional[List[int]] = None
    custom_splits: Optional[List[dict]] = None
    frequency: str = Field("Monthly", pattern="^(Monthly|Bi-Monthly|Quarterly|As Required)$")
    start_date: Optional[date] = None
    next_due_date: Optional[date] = None
    notes: Optional[str] = None
    is_active: bool = True

class RecurringCreate(RecurringBase):
    pass

class RecurringUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    category_id: Optional[int] = None
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    paid_by: Optional[int] = None
    split_type: Optional[str] = Field(None, pattern="^(equal|custom|percentage|shares)$")
    split_members: Optional[List[int]] = None
    custom_splits: Optional[List[dict]] = None
    frequency: Optional[str] = Field(None, pattern="^(Monthly|Bi-Monthly|Quarterly|As Required)$")
    start_date: Optional[date] = None
    next_due_date: Optional[date] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class RecurringOut(BaseModel):
    id: int
    title: str
    category_id: int
    amount: Decimal
    paid_by: int
    split_type: str
    split_members: Optional[List[int]] = None
    frequency: str
    start_date: Optional[date] = None
    next_due_date: Optional[date] = None
    last_generated_period: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: datetime
    
    category: Optional[CategoryOut] = None
    payer: Optional[MemberOut] = None
    model_config = ConfigDict(from_attributes=True)

    @field_validator("split_members", mode="before")
    @classmethod
    def parse_split_members_field(cls, v):
        if isinstance(v, list):
            if v and isinstance(v[0], dict):
                return [d["member_id"] for d in v if "member_id" in d]
            return v
        if isinstance(v, str):
            v_str = v.strip()
            if not v_str:
                return []
            if v_str.startswith("["):
                try:
                    data = json.loads(v_str)
                    if isinstance(data, list):
                        if data and isinstance(data[0], dict):
                            return [d["member_id"] for d in data if "member_id" in d]
                        return data
                except Exception:
                    pass
            return [int(x.strip()) for x in v_str.split(",") if x.strip().isdigit()]
        return []

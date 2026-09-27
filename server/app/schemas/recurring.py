from datetime import datetime
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
    split_type: str = Field("equal", pattern="^(equal|custom)$")
    split_members: Optional[List[int]] = None
    frequency: str = Field("Monthly", max_length=50)
    notes: Optional[str] = None
    is_active: bool = True

class RecurringCreate(RecurringBase):
    pass

class RecurringUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    category_id: Optional[int] = None
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    paid_by: Optional[int] = None
    split_type: Optional[str] = Field(None, pattern="^(equal|custom)$")
    split_members: Optional[List[int]] = None
    frequency: Optional[str] = None
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
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    
    category: Optional[CategoryOut] = None
    payer: Optional[MemberOut] = None
    model_config = ConfigDict(from_attributes=True)

    @field_validator("split_members", mode="before")
    @classmethod
    def parse_split_members_field(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v_str = v.strip()
            if not v_str:
                return []
            if v_str.startswith("["):
                try:
                    return json.loads(v_str)
                except Exception:
                    pass
            return [int(x.strip()) for x in v_str.split(",") if x.strip().isdigit()]
        return []

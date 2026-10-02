from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel
from app.schemas.expense import ExpenseOut
from app.schemas.payment import PaymentOut

class MemberBalanceOut(BaseModel):
    member_id: int
    member_name: str
    upi_id: Optional[str] = None
    is_active: bool = True
    total_paid: Decimal
    total_owed: Decimal
    settlements_paid: Decimal
    settlements_received: Decimal
    net_balance: Decimal
    status: str # "Receivable", "Owes", "Settled"

class SettlementRecommendation(BaseModel):
    from_member_id: int
    from_member_name: str
    to_member_id: int
    to_member_name: str
    to_member_upi: Optional[str] = None
    amount: Decimal
    upi_link: Optional[str] = None

class CategoryBreakdownItem(BaseModel):
    category_id: int
    category_name: str
    total_amount: Decimal
    percentage: Decimal
    expense_count: int

class MemberContributionItem(BaseModel):
    member_id: int
    member_name: str
    amount_paid: Decimal
    percentage: Decimal

class MemberShareItem(BaseModel):
    member_id: int
    member_name: str
    amount_owed: Decimal
    percentage: Decimal

class DashboardStats(BaseModel):
    current_month_name: str
    current_year: int
    current_month: int
    month_expenses_total: Decimal
    flat_all_time_expenses: Decimal
    active_members_count: int = 6
    viewer_id: Optional[int] = None
    viewer_name: Optional[str] = None
    viewer_paid: Decimal = Decimal("0.00")
    viewer_share: Decimal = Decimal("0.00")
    viewer_net_balance: Decimal = Decimal("0.00")
    viewer_owes_to: List[SettlementRecommendation] = []
    viewer_receivable_from: List[SettlementRecommendation] = []
    balances: List[MemberBalanceOut] = []
    suggested_settlements: List[SettlementRecommendation] = []
    pending_payments: List[PaymentOut] = []
    recent_expenses: List[ExpenseOut] = []
    category_breakdown: List[CategoryBreakdownItem] = []

class MonthItem(BaseModel):
    year: int
    month: int
    month_name: str
    total_amount: Decimal
    expense_count: int

class MonthlyDetailOut(BaseModel):
    year: int
    month: int
    month_name: str
    total_amount: Decimal
    expense_count: int
    categories: List[CategoryBreakdownItem] = []
    contributions: List[MemberContributionItem] = []
    shares: List[MemberShareItem] = []
    expenses: List[ExpenseOut] = []

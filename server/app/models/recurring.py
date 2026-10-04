from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class RecurringExpense(Base):
    __tablename__ = "recurring_expenses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    paid_by = Column(Integer, ForeignKey("members.id"), nullable=False)
    split_type = Column(String(20), default="equal", nullable=False) # "equal" or "custom"
    split_members = Column(Text, nullable=True) # JSON array of member IDs or map of member_id -> amount
    frequency = Column(String(50), default="Monthly", nullable=False) # "Monthly", "Quarterly", "As Required"
    last_generated_period = Column(String(20), nullable=True) # e.g. "2026-10"
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    category = relationship("Category", back_populates="recurring_expenses")
    payer = relationship("Member", back_populates="recurring_expenses")

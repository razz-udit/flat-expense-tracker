from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    username = Column(String(50), unique=True, index=True, nullable=True)
    email = Column(String(150), nullable=True)
    upi_id = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=True)
    google_id = Column(String(100), unique=True, index=True, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)
    token_version = Column(Integer, default=1, nullable=False)
    claim_token_hash = Column(String(255), nullable=True)
    claim_token_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    expenses_paid = relationship("Expense", back_populates="payer", foreign_keys="Expense.paid_by")
    splits = relationship("ExpenseSplit", back_populates="member")
    payments_made = relationship("Payment", back_populates="payer", foreign_keys="Payment.from_member")
    payments_received = relationship("Payment", back_populates="receiver", foreign_keys="Payment.to_member")
    recurring_expenses = relationship("RecurringExpense", back_populates="payer")

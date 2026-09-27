from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, Date, DateTime, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    from_member = Column(Integer, ForeignKey("members.id"), nullable=False)
    to_member = Column(Integer, ForeignKey("members.id"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), default="Paid", nullable=False) # "Pending" or "Paid"
    payment_method = Column(String(50), default="UPI", nullable=True) # "UPI", "Cash", "Bank Transfer"
    transaction_reference = Column(String(100), nullable=True) # UTR or Ref number
    payment_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    payer = relationship("Member", back_populates="payments_made", foreign_keys=[from_member])
    receiver = relationship("Member", back_populates="payments_received", foreign_keys=[to_member])

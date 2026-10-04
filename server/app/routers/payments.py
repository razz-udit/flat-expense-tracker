from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.payment import Payment
from app.models.member import Member
from app.schemas.payment import PaymentCreate, PaymentUpdate, PaymentOut
from app.services.upi_service import generate_upi_link
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/payments", tags=["Payments"])

def attach_upi_link(payment: Payment) -> PaymentOut:
    out = PaymentOut.model_validate(payment)
    if payment.receiver and payment.receiver.upi_id:
        out.upi_link = generate_upi_link(
            upi_id=payment.receiver.upi_id,
            payee_name=payment.receiver.name,
            amount=payment.amount,
            transaction_note=payment.notes or f"Flat Payment from {payment.payer.name if payment.payer else 'Member'}"
        )
    return out

@router.get("", response_model=List[PaymentOut])
def get_payments(
    status_filter: Optional[str] = Query(None, alias="status"),
    from_member: Optional[int] = None,
    to_member: Optional[int] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Payment).options(
        joinedload(Payment.payer),
        joinedload(Payment.receiver)
    )

    if status_filter:
        query = query.filter(Payment.status.ilike(status_filter))
    if from_member:
        query = query.filter(Payment.from_member == from_member)
    if to_member:
        query = query.filter(Payment.to_member == to_member)

    payments = query.order_by(Payment.payment_date.desc(), Payment.id.desc()).all()
    return [attach_upi_link(p) for p in payments]

@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    data: PaymentCreate, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if data.from_member == data.to_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot record a settlement to yourself. Sender and receiver must be different members."
        )

    if data.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment amount must be greater than 0."
        )

    payer = db.query(Member).filter(Member.id == data.from_member).first()
    receiver = db.query(Member).filter(Member.id == data.to_member).first()
    if not payer or not receiver:
        raise HTTPException(status_code=400, detail="Invalid payer or receiver member")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != data.from_member and current_user.id != data.to_member and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: You cannot record settlements between {payer.name} and {receiver.name}."
        )

    payment = Payment(
        from_member=data.from_member,
        to_member=data.to_member,
        amount=round(data.amount, 2),
        payment_date=data.payment_date,
        status=data.status or "Paid",
        payment_method=data.payment_method or "UPI",
        transaction_reference=data.transaction_reference.strip() if data.transaction_reference else None,
        notes=data.notes.strip() if data.notes else None
    )
    if payment.status == "Paid":
        payment.verified_at = datetime.now()

    db.add(payment)
    db.commit()
    db.refresh(payment)
    return attach_upi_link(payment)

@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    payment = db.query(Payment).options(
        joinedload(Payment.payer),
        joinedload(Payment.receiver)
    ).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return attach_upi_link(payment)

@router.put("/{payment_id}", response_model=PaymentOut)
def update_payment(
    payment_id: int, 
    data: PaymentUpdate, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payment = db.query(Payment).options(
        joinedload(Payment.payer),
        joinedload(Payment.receiver)
    ).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != payment.from_member and current_user.id != payment.to_member and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only the sender, receiver, or flat admin can modify this payment."
        )

    if data.status is not None:
        payment.status = data.status
        if data.status == "Paid" and not payment.verified_at:
            payment.verified_at = datetime.now()
    if data.amount is not None:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0.")
        payment.amount = round(data.amount, 2)
    if data.payment_method is not None:
        payment.payment_method = data.payment_method
    if data.transaction_reference is not None:
        payment.transaction_reference = data.transaction_reference.strip() if data.transaction_reference else None
    if data.payment_date is not None:
        payment.payment_date = data.payment_date
    if data.notes is not None:
        payment.notes = data.notes.strip() if data.notes else None

    db.commit()
    db.refresh(payment)
    return attach_upi_link(payment)

@router.post("/{payment_id}/verify", response_model=PaymentOut)
def verify_payment(
    payment_id: int, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payment = db.query(Payment).options(
        joinedload(Payment.payer),
        joinedload(Payment.receiver)
    ).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != payment.to_member and not is_admin:
        receiver_name = payment.receiver.name if payment.receiver else f"Member {payment.to_member}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: Only {receiver_name} (the receiver) or flat admin can verify this settlement."
        )

    payment.status = "Paid"
    payment.verified_at = datetime.now()
    db.commit()
    db.refresh(payment)
    return attach_upi_link(payment)

@router.delete("/{payment_id}")
def delete_payment(
    payment_id: int, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != payment.from_member and current_user.id != payment.to_member and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only the sender, receiver, or flat admin can delete this settlement record."
        )

    db.delete(payment)
    db.commit()
    return {"message": "Payment record deleted successfully"}

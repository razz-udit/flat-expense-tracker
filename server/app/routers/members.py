from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.member import Member
from app.models.expense import Expense, ExpenseSplit
from app.models.payment import Payment
from app.models.recurring import RecurringExpense
from app.schemas.member import MemberCreate, MemberUpdate, MemberOut, ConfigureFlatSizeRequest
from app.dependencies import require_admin

router = APIRouter(prefix="/api/members", tags=["Members"])

@router.post("/configure-size", response_model=List[MemberOut])
def configure_flat_size(
    data: ConfigureFlatSizeRequest, 
    admin: Member = Depends(require_admin),
    db: Session = Depends(get_db)
):
    target_count = data.count
    if target_count < 2 or target_count > 30:
        raise HTTPException(status_code=400, detail="Flat size must be between 2 and 30 members.")
    
    current_members = db.query(Member).order_by(Member.id).all()
    active_members = [m for m in current_members if m.is_active]
    
    if data.members and len(data.members) > 0:
        for idx, item in enumerate(data.members):
            if idx < len(active_members):
                m = active_members[idx]
                m.name = item.name.strip()
                m.email = item.email.strip() if item.email else None
                m.upi_id = item.upi_id.strip() if item.upi_id else None
                m.is_active = True
            else:
                new_m = Member(
                    name=item.name.strip(),
                    email=item.email.strip() if item.email else None,
                    upi_id=item.upi_id.strip() if item.upi_id else None,
                    is_active=True
                )
                db.add(new_m)
        
        if len(active_members) > target_count:
            for m in active_members[target_count:]:
                has_tx = (
                    db.query(Expense).filter(Expense.paid_by == m.id).count() > 0 or
                    db.query(ExpenseSplit).filter(ExpenseSplit.member_id == m.id).count() > 0 or
                    db.query(Payment).filter((Payment.from_member == m.id) | (Payment.to_member == m.id)).count() > 0 or
                    db.query(RecurringExpense).filter(RecurringExpense.paid_by == m.id).count() > 0
                )
                if has_tx:
                    m.is_active = False
                else:
                    db.delete(m)
    else:
        if target_count > len(active_members):
            to_add = target_count - len(active_members)
            for i in range(to_add):
                next_num = len(active_members) + i + 1
                db.add(Member(
                    name=f"Member {next_num}",
                    email=f"member{next_num}@flat.local",
                    upi_id=f"member{next_num}@upi",
                    is_active=True
                ))
        elif target_count < len(active_members):
            excess = active_members[target_count:]
            for m in excess:
                has_tx = (
                    db.query(Expense).filter(Expense.paid_by == m.id).count() > 0 or
                    db.query(ExpenseSplit).filter(ExpenseSplit.member_id == m.id).count() > 0 or
                    db.query(Payment).filter((Payment.from_member == m.id) | (Payment.to_member == m.id)).count() > 0 or
                    db.query(RecurringExpense).filter(RecurringExpense.paid_by == m.id).count() > 0
                )
                if has_tx:
                    m.is_active = False
                else:
                    db.delete(m)

    db.commit()
    return db.query(Member).filter(Member.is_active == True).order_by(Member.id).all()

@router.get("", response_model=List[MemberOut])
def get_members(include_inactive: bool = False, db: Session = Depends(get_db)):
    query = db.query(Member)
    if not include_inactive:
        query = query.filter(Member.is_active == True)
    return query.order_by(Member.id).all()

@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def create_member(
    data: MemberCreate, 
    admin: Member = Depends(require_admin),
    db: Session = Depends(get_db)
):
    member = Member(
        name=data.name.strip(),
        email=data.email.strip() if data.email else None,
        upi_id=data.upi_id.strip() if data.upi_id else None,
        is_active=True,
        is_admin=False
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member

@router.get("/{member_id}", response_model=MemberOut)
def get_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member

@router.put("/{member_id}", response_model=MemberOut)
def update_member(
    member_id: int, 
    data: MemberUpdate, 
    admin: Member = Depends(require_admin),
    db: Session = Depends(get_db)
):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if data.name is not None:
        member.name = data.name.strip()
    if data.email is not None:
        member.email = data.email.strip() if data.email else None
    if data.upi_id is not None:
        member.upi_id = data.upi_id.strip() if data.upi_id else None
    if data.is_active is not None:
        member.is_active = data.is_active
    if data.is_admin is not None:
        if not data.is_admin and member.is_admin:
            # Check if this is the only active admin
            admin_count = db.query(Member).filter(Member.is_admin == True, Member.is_active == True).count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot revoke admin rights: At least one active admin must remain.")
        member.is_admin = data.is_admin

    db.commit()
    db.refresh(member)
    return member

@router.delete("/{member_id}")
def delete_member(
    member_id: int, 
    admin: Member = Depends(require_admin),
    db: Session = Depends(get_db)
):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if member.is_admin:
        admin_count = db.query(Member).filter(Member.is_admin == True, Member.is_active == True).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete or deactivate the only flat admin.")

    # Check historical dependencies
    has_expenses_paid = db.query(Expense).filter(Expense.paid_by == member_id).count() > 0
    has_splits = db.query(ExpenseSplit).filter(ExpenseSplit.member_id == member_id).count() > 0
    has_payments = db.query(Payment).filter(
        (Payment.from_member == member_id) | (Payment.to_member == member_id)
    ).count() > 0
    has_recurring = db.query(RecurringExpense).filter(RecurringExpense.paid_by == member_id).count() > 0

    if has_expenses_paid or has_splits or has_payments or has_recurring:
        # Soft delete to preserve historical integrity
        member.is_active = False
        db.commit()
        return {
            "message": f"Member '{member.name}' has historical transactions and was deactivated (soft-deleted) rather than permanently removed.",
            "soft_deleted": True
        }

    db.delete(member)
    db.commit()
    return {"message": f"Member '{member.name}' deleted successfully", "soft_deleted": False}

import secrets
import hashlib
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.member import Member
from app.models.expense import Expense, ExpenseSplit
from app.models.payment import Payment
from app.models.recurring import RecurringExpense
from app.schemas.member import MemberCreate, MemberUpdate, MemberOut, ConfigureFlatSizeRequest, LeavePreviewResponse
from app.schemas.auth import InviteTokenResponse
from app.dependencies import get_current_user, require_admin
from app.services.audit_service import log_audit
from app.services.balance_service import calculate_all_balances, calculate_settlements

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
    
    if data.members and len(data.members) != target_count:
        raise HTTPException(
            status_code=400, 
            detail=f"Number of configured members ({len(data.members)}) must exactly match target flat count ({target_count})."
        )
    
    current_members = db.query(Member).all()
    member_by_id = {m.id: m for m in current_members}
    
    configured_member_ids = set()
    
    if data.members and len(data.members) > 0:
        # Match by database ID, never by position
        for item in data.members:
            if getattr(item, "id", None) and item.id in member_by_id:
                m = member_by_id[item.id]
                m.name = item.name.strip()
                m.email = item.email.strip() if item.email else None
                m.upi_id = item.upi_id.strip() if item.upi_id else None
                m.is_active = True
                configured_member_ids.add(m.id)
            else:
                new_m = Member(
                    name=item.name.strip(),
                    email=item.email.strip() if item.email else None,
                    upi_id=item.upi_id.strip() if item.upi_id else None,
                    is_active=True,
                    is_admin=False,
                    token_version=1
                )
                db.add(new_m)
                db.flush()
                configured_member_ids.add(new_m.id)
        
        # Deactivate or remove members not included in the new configured set
        for m in current_members:
            if m.id not in configured_member_ids and m.is_active:
                # Invariant: Must not deactivate the only active admin
                remaining_admins = [
                    adm for adm in current_members 
                    if (adm.is_admin and adm.id in configured_member_ids)
                ]
                if not remaining_admins:
                    # If this member was an admin and no other admin is configured active, prevent removal
                    raise HTTPException(
                        status_code=400, 
                        detail="Cannot update flat configuration: At least one active flat administrator must remain."
                    )
                
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
        # Auto-expand or shrink
        active_members = [m for m in current_members if m.is_active]
        if target_count > len(active_members):
            to_add = target_count - len(active_members)
            for i in range(to_add):
                next_num = len(active_members) + i + 1
                db.add(Member(
                    name=f"Member {next_num}",
                    email=f"member{next_num}@flat.local",
                    upi_id=f"member{next_num}@upi",
                    is_active=True,
                    is_admin=False,
                    token_version=1
                ))
        elif target_count < len(active_members):
            excess = active_members[target_count:]
            for m in excess:
                if m.is_admin:
                    remaining_admins = [adm for adm in active_members[:target_count] if adm.is_admin]
                    if not remaining_admins:
                        raise HTTPException(
                            status_code=400, 
                            detail="Cannot reduce flat size: The flat administrator would be removed. At least one active administrator must remain."
                        )
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

    # Invariant: Ensure at least one active member is an admin
    db.flush()
    active_now = db.query(Member).filter(Member.is_active == True).all()
    has_any_admin = any(m.is_admin for m in active_now)
    if not has_any_admin and active_now:
        # Elevate the current calling admin or the first active member
        target_admin = next((m for m in active_now if m.id == admin.id), active_now[0])
        target_admin.is_admin = True

    db.commit()

    log_audit(db, "members.configure_size", member_id=admin.id, details={"target_count": target_count})

    return db.query(Member).filter(Member.is_active == True).order_by(Member.id).all()

@router.get("", response_model=List[MemberOut])
def get_members(
    include_inactive: bool = False, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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
        is_admin=False,
        token_version=1
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    log_audit(db, "member.created", member_id=member.id, details={"created_by": admin.id, "name": member.name})

    return member

@router.get("/{member_id}", response_model=MemberOut)
def get_member(
    member_id: int, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member

@router.post("/{member_id}/generate-invite", response_model=InviteTokenResponse)
def generate_invite_token(
    member_id: int,
    admin: Member = Depends(require_admin),
    db: Session = Depends(get_db)
):
    member = db.query(Member).filter(Member.id == member_id, Member.is_active == True).first()
    if not member:
        raise HTTPException(status_code=404, detail="Active member not found.")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now() + timedelta(hours=48)

    member.claim_token_hash = token_hash
    member.claim_token_expires_at = expires_at
    db.commit()

    log_audit(db, "member.invite_generated", member_id=member.id, details={"admin_id": admin.id})

    return InviteTokenResponse(
        member_id=member.id,
        member_name=member.name,
        claim_token=raw_token,
        claim_url=f"/claim?token={raw_token}",
        expires_at=expires_at.isoformat()
    )

@router.get("/{member_id}/leave-preview", response_model=LeavePreviewResponse)
def get_leave_preview(
    member_id: int,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found.")

    balances = calculate_all_balances(db)
    settlements = calculate_settlements(balances)

    target_balance = next((b for b in balances if b.member_id == member_id), None)
    net_bal = target_balance.net_balance if target_balance else Decimal("0.00")

    debts = sum((s.amount for s in settlements if s.from_member_id == member_id), Decimal("0.00"))
    credits = sum((s.amount for s in settlements if s.to_member_id == member_id), Decimal("0.00"))

    active_recurring = db.query(RecurringExpense).filter(
        RecurringExpense.paid_by == member_id, 
        RecurringExpense.is_active == True
    ).count()

    unresolved_disputes = db.query(Expense).filter(
        (Expense.paid_by == member_id) | (Expense.disputed_by == member_id),
        Expense.verification_status == "Disputed / Flagged"
    ).count()

    can_leave = abs(net_bal) < Decimal("0.01") and active_recurring == 0 and unresolved_disputes == 0
    if can_leave:
        msg = f"{member.name} has settled all debts and credits and can leave the flat cleanly."
    else:
        reasons = []
        if debts > Decimal("0.00"):
            reasons.append(f"owes ₹{debts:.2f} in unsettled debts")
        if credits > Decimal("0.00"):
            reasons.append(f"is owed ₹{credits:.2f} in unsettled credits")
        if active_recurring > 0:
            reasons.append(f"is payer for {active_recurring} active recurring expense(s)")
        if unresolved_disputes > 0:
            reasons.append(f"has {unresolved_disputes} unresolved expense dispute(s)")
        msg = f"{member.name} cannot leave cleanly yet: " + "; ".join(reasons) + "."

    return LeavePreviewResponse(
        member_id=member.id,
        member_name=member.name,
        net_balance=net_bal,
        amount_owed=debts,
        amount_receivable=credits,
        outstanding_debts=debts,
        outstanding_credits=credits,
        active_recurring_count=active_recurring,
        unresolved_disputes_count=unresolved_disputes,
        can_leave_cleanly=can_leave,
        can_leave=can_leave,
        message=msg
    )

@router.post("/{member_id}/leave")
def leave_flat(
    member_id: int,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only member themselves or admin can trigger leaving
    if current_user.id != member_id and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: You can only deactivate your own flat membership or an administrator must perform this action."
        )

    member = db.query(Member).filter(Member.id == member_id, Member.is_active == True).first()
    if not member:
        raise HTTPException(status_code=404, detail="Active member not found.")

    if member.is_admin:
        admin_count = db.query(Member).filter(Member.is_admin == True, Member.is_active == True).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400, 
                detail="Cannot leave flat: You are the only active flat administrator. Please assign another administrator first."
            )

    # Deactivate any recurring expenses where member is payer
    db.query(RecurringExpense).filter(RecurringExpense.paid_by == member.id).update({"is_active": False})

    member.is_active = False
    member.token_version = getattr(member, "token_version", 1) + 1
    db.commit()

    log_audit(db, "member.left", member_id=member.id, details={"initiated_by": current_user.id})

    return {
        "success": True,
        "message": f"Member '{member.name}' has left the flat and been deactivated. Associated recurring expenses have been paused."
    }

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
        if not data.is_active and member.is_admin:
            admin_count = db.query(Member).filter(Member.is_admin == True, Member.is_active == True).count()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot deactivate the only flat administrator.")
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

    log_audit(db, "member.updated", member_id=member.id, details={"updated_by": admin.id})

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

    log_audit(db, "member.deleted", member_id=member.id, details={"deleted_by": admin.id, "soft_deleted": (has_expenses_paid or has_splits or has_payments or has_recurring)})

    if has_expenses_paid or has_splits or has_payments or has_recurring:
        # Soft delete to preserve historical integrity
        member.is_active = False
        member.token_version = getattr(member, "token_version", 1) + 1
        db.commit()
        return {
            "message": f"Member '{member.name}' has historical transactions and was deactivated (soft-deleted) rather than permanently removed.",
            "soft_deleted": True
        }

    db.delete(member)
    db.commit()
    return {"message": f"Member '{member.name}' deleted successfully", "soft_deleted": False}

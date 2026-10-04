import json
import calendar
import types
from datetime import date
from decimal import Decimal
from typing import List, Optional, Tuple, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import extract
from app.database import get_db
from app.models.recurring import RecurringExpense
from app.models.expense import Expense, ExpenseSplit
from app.models.member import Member
from app.models.category import Category
from app.schemas.recurring import RecurringCreate, RecurringUpdate, RecurringOut
from app.schemas.expense import ExpenseOut
from app.routers.expenses import (
    compute_equal_splits, 
    compute_percentage_splits, 
    compute_shares_splits
)
from app.dependencies import get_current_user
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/recurring", tags=["Recurring Expenses"])

class CreateExpenseFromRecurringRequest(BaseModel):
    expense_date: Optional[date] = None
    description: Optional[str] = None

def add_months_safe(base_date: date, months: int) -> date:
    new_year = base_date.year + (base_date.month + months - 1) // 12
    new_month = (base_date.month + months - 1) % 12 + 1
    max_days = calendar.monthrange(new_year, new_month)[1]
    new_day = min(base_date.day, max_days)
    return date(new_year, new_month, new_day)

def decode_split_info(raw: Optional[str]) -> Tuple[List[int], Optional[List[dict]]]:
    if not raw:
        return [], None
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            if data and isinstance(data[0], dict):
                m_ids = [d["member_id"] for d in data if "member_id" in d]
                return m_ids, data
            elif data and isinstance(data[0], int):
                return data, None
        return [int(x.strip()) for x in raw.split(",") if x.strip().isdigit()], None
    except Exception:
        return [], None

def format_recurring_out(item: RecurringExpense) -> RecurringOut:
    return RecurringOut.model_validate(item)

@router.get("", response_model=List[RecurringOut])
def get_recurring(
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    items = db.query(RecurringExpense).options(
        joinedload(RecurringExpense.category),
        joinedload(RecurringExpense.payer)
    ).order_by(RecurringExpense.id).all()
    return [format_recurring_out(i) for i in items]

@router.post("", response_model=RecurringOut, status_code=status.HTTP_201_CREATED)
def create_recurring(
    data: RecurringCreate, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")
    if not category.is_active:
        raise HTTPException(status_code=400, detail="Cannot assign inactive category to recurring template.")

    payer = db.query(Member).filter(Member.id == data.paid_by).first()
    if not payer:
        raise HTTPException(status_code=400, detail="Payer not found")
    if not payer.is_active:
        raise HTTPException(status_code=400, detail="Cannot assign inactive member as payer of recurring template.")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != data.paid_by and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: You cannot create a recurring expense paid by {payer.name}."
        )

    # Encode splits
    members_str = None
    if data.custom_splits:
        members_str = json.dumps(data.custom_splits)
    elif data.split_members:
        members_str = json.dumps(data.split_members)

    start_d = data.start_date or date.today()
    next_due = data.next_due_date
    if not next_due:
        freq = data.frequency
        if freq == "Monthly":
            next_due = add_months_safe(start_d, 1)
        elif freq == "Bi-Monthly":
            next_due = add_months_safe(start_d, 2)
        elif freq == "Quarterly":
            next_due = add_months_safe(start_d, 3)

    item = RecurringExpense(
        title=data.title.strip(),
        category_id=data.category_id,
        amount=round(data.amount, 2),
        paid_by=data.paid_by,
        split_type=data.split_type,
        split_members=members_str,
        frequency=data.frequency,
        start_date=start_d,
        next_due_date=next_due,
        notes=data.notes.strip() if data.notes else None,
        is_active=data.is_active
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    log_audit(db, "recurring.created", member_id=current_user.id, details={"recurring_id": item.id, "title": item.title})

    return format_recurring_out(item)

@router.put("/{recurring_id}", response_model=RecurringOut)
def update_recurring(
    recurring_id: int, 
    data: RecurringUpdate, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(RecurringExpense).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != item.paid_by and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only the payer or flat admin can update this recurring template."
        )

    if data.title is not None:
        item.title = data.title.strip()
    if data.category_id is not None:
        cat = db.query(Category).filter(Category.id == data.category_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Category not found")
        if not cat.is_active:
            raise HTTPException(status_code=400, detail="Category is inactive.")
        item.category_id = data.category_id
    if data.paid_by is not None:
        payer = db.query(Member).filter(Member.id == data.paid_by).first()
        if not payer:
            raise HTTPException(status_code=400, detail="Payer not found")
        if not payer.is_active:
            raise HTTPException(status_code=400, detail="Payer is inactive.")
        item.paid_by = data.paid_by
    if data.amount is not None:
        item.amount = round(data.amount, 2)
    if data.split_type is not None:
        item.split_type = data.split_type
    if data.custom_splits is not None:
        item.split_members = json.dumps(data.custom_splits)
    elif data.split_members is not None:
        item.split_members = json.dumps(data.split_members)
    if data.frequency is not None:
        item.frequency = data.frequency
    if data.start_date is not None:
        item.start_date = data.start_date
    if data.next_due_date is not None:
        item.next_due_date = data.next_due_date
    if data.notes is not None:
        item.notes = data.notes.strip() if data.notes else None
    if data.is_active is not None:
        item.is_active = data.is_active

    db.commit()
    db.refresh(item)

    log_audit(db, "recurring.updated", member_id=current_user.id, details={"recurring_id": item.id})

    return format_recurring_out(item)

@router.delete("/{recurring_id}")
def delete_recurring(
    recurring_id: int, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(RecurringExpense).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != item.paid_by and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only the payer or flat admin can delete this recurring template."
        )

    log_audit(db, "recurring.deleted", member_id=current_user.id, details={"recurring_id": item.id, "title": item.title})

    db.delete(item)
    db.commit()
    return {"message": "Recurring expense template deleted successfully"}

@router.post("/{recurring_id}/create-expense", response_model=ExpenseOut)
def create_expense_from_recurring(
    recurring_id: int,
    payload: Optional[CreateExpenseFromRecurringRequest] = None,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    item = db.query(RecurringExpense).options(
        joinedload(RecurringExpense.category),
        joinedload(RecurringExpense.payer)
    ).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")

    # Authorization: strictly payer or admin
    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != item.paid_by and not is_admin:
        payer_name = item.payer.name if item.payer else f"Member {item.paid_by}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: Only the template payer ({payer_name}) or a flat administrator can generate expenses from this recurring schedule."
        )

    if not item.is_active:
        raise HTTPException(status_code=400, detail="Cannot generate expense from an inactive recurring template.")

    if not item.category or not item.category.is_active:
        raise HTTPException(status_code=400, detail="The category for this recurring template is inactive.")

    if not item.payer or not item.payer.is_active:
        raise HTTPException(status_code=400, detail="The designated payer for this recurring template is inactive.")

    target_date = (payload.expense_date if payload and payload.expense_date else date.today())
    description = (payload.description if payload and payload.description else f"{item.title} ({target_date.strftime('%B %Y')})")
    period_key = target_date.strftime("%Y-%m")

    # Enforce schedule frequency & idempotency
    freq = item.frequency or "Monthly"
    if freq == "Monthly":
        # Cannot generate twice for the exact same calendar month
        if item.last_generated_period == period_key:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An expense for '{item.title}' has already been generated for {target_date.strftime('%B %Y')}."
            )
        existing_generated = db.query(Expense).filter(
            Expense.recurring_id == item.id,
            extract("year", Expense.expense_date) == target_date.year,
            extract("month", Expense.expense_date) == target_date.month
        ).first()
        if existing_generated:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An expense for '{item.title}' has already been recorded for {target_date.strftime('%B %Y')}."
            )
    elif freq in ("Bi-Monthly", "Quarterly"):
        interval_months = 2 if freq == "Bi-Monthly" else 3
        if item.last_generated_period:
            try:
                last_y, last_m = map(int, item.last_generated_period.split("-"))
                diff_m = (target_date.year - last_y) * 12 + (target_date.month - last_m)
                if diff_m < interval_months:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"An expense for '{item.title}' was already generated within the {freq} schedule period ({item.last_generated_period})."
                    )
            except ValueError:
                pass

    # Decode split configuration and active participants
    parsed_ids, custom_data = decode_split_info(item.split_members)
    active_members_query = db.query(Member.id).filter(Member.is_active == True)
    if parsed_ids:
        active_ids = [m[0] for m in active_members_query.filter(Member.id.in_(parsed_ids)).all()]
    else:
        active_ids = [m[0] for m in active_members_query.all()]

    if not active_ids:
        raise HTTPException(status_code=400, detail="No active members available to split this recurring expense.")

    split_type = item.split_type or "equal"
    split_records: List[Tuple[int, Decimal, Optional[Decimal], Optional[Decimal]]] = []

    if split_type == "percentage" and custom_data:
        active_splits = [
            types.SimpleNamespace(
                member_id=d["member_id"],
                amount=Decimal(str(d["amount"])) if d.get("amount") is not None else None,
                percentage=Decimal(str(d["percentage"])) if d.get("percentage") is not None else None
            )
            for d in custom_data if d.get("member_id") in active_ids
        ]
        if active_splits:
            split_records = compute_percentage_splits(item.amount, active_splits)
        else:
            split_records = compute_equal_splits(item.amount, active_ids)
    elif split_type == "shares" and custom_data:
        active_splits = [
            types.SimpleNamespace(
                member_id=d["member_id"],
                amount=Decimal(str(d["amount"])) if d.get("amount") is not None else None,
                shares=Decimal(str(d["shares"])) if d.get("shares") is not None else Decimal("1.00")
            )
            for d in custom_data if d.get("member_id") in active_ids
        ]
        if active_splits:
            split_records = compute_shares_splits(item.amount, active_splits)
        else:
            split_records = compute_equal_splits(item.amount, active_ids)
    elif split_type in ("custom", "exact") and custom_data:
        active_items = [d for d in custom_data if d.get("member_id") in active_ids and d.get("amount") is not None]
        total_custom = sum(Decimal(str(d["amount"])) for d in active_items)
        if total_custom > 0:
            ratio = item.amount / total_custom
            split_records = [
                (d["member_id"], round(Decimal(str(d["amount"])) * ratio, 2), None, None)
                for d in active_items
            ]
        else:
            split_records = compute_equal_splits(item.amount, active_ids)
    else:
        split_records = compute_equal_splits(item.amount, active_ids)

    expense = Expense(
        category_id=item.category_id,
        amount=item.amount,
        paid_by=item.paid_by,
        description=description,
        expense_date=target_date,
        split_type=split_type,
        recurring_id=item.id,
        notes=item.notes
    )
    db.add(expense)
    db.flush()

    for mid, amt, sh, pct in split_records:
        split = ExpenseSplit(
            expense_id=expense.id,
            member_id=mid,
            amount=amt,
            shares=sh,
            percentage=pct
        )
        db.add(split)

    # Advance next due date safely
    if freq == "Monthly":
        item.next_due_date = add_months_safe(target_date, 1)
    elif freq == "Bi-Monthly":
        item.next_due_date = add_months_safe(target_date, 2)
    elif freq == "Quarterly":
        item.next_due_date = add_months_safe(target_date, 3)

    item.last_generated_period = period_key
    db.commit()
    db.refresh(expense)

    log_audit(db, "recurring.generated_expense", member_id=current_user.id, details={"recurring_id": item.id, "expense_id": expense.id, "period": period_key})

    return expense

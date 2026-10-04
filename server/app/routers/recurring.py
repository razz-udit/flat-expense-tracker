import json
from datetime import date
from decimal import Decimal
from typing import List, Optional
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
from app.routers.expenses import compute_equal_splits
from app.dependencies import get_current_user

router = APIRouter(prefix="/api/recurring", tags=["Recurring Expenses"])

class CreateExpenseFromRecurringRequest(BaseModel):
    expense_date: Optional[date] = None
    description: Optional[str] = None

def parse_split_members(split_members_str: Optional[str]) -> List[int]:
    if not split_members_str:
        return []
    try:
        if split_members_str.startswith("["):
            return json.loads(split_members_str)
        return [int(x.strip()) for x in split_members_str.split(",") if x.strip()]
    except Exception:
        return []

def format_recurring_out(item: RecurringExpense) -> RecurringOut:
    return RecurringOut.model_validate(item)

@router.get("", response_model=List[RecurringOut])
def get_recurring(db: Session = Depends(get_db)):
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

    payer = db.query(Member).filter(Member.id == data.paid_by).first()
    if not payer:
        raise HTTPException(status_code=400, detail="Payer not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != data.paid_by and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: You cannot create a recurring expense paid by {payer.name}."
        )

    members_str = None
    if data.split_members:
        members_str = json.dumps(data.split_members)

    item = RecurringExpense(
        title=data.title.strip(),
        category_id=data.category_id,
        amount=round(data.amount, 2),
        paid_by=data.paid_by,
        split_type=data.split_type,
        split_members=members_str,
        frequency=data.frequency,
        notes=data.notes.strip() if data.notes else None,
        is_active=data.is_active
    )
    db.add(item)
    db.commit()
    db.refresh(item)
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
        item.category_id = data.category_id
    if data.paid_by is not None:
        payer = db.query(Member).filter(Member.id == data.paid_by).first()
        if not payer:
            raise HTTPException(status_code=400, detail="Payer not found")
        item.paid_by = data.paid_by
    if data.amount is not None:
        item.amount = round(data.amount, 2)
    if data.split_type is not None:
        item.split_type = data.split_type
    if data.split_members is not None:
        item.split_members = json.dumps(data.split_members)
    if data.frequency is not None:
        item.frequency = data.frequency
    if data.notes is not None:
        item.notes = data.notes.strip() if data.notes else None
    if data.is_active is not None:
        item.is_active = data.is_active

    db.commit()
    db.refresh(item)
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
    item = db.query(RecurringExpense).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")

    target_date = (payload.expense_date if payload and payload.expense_date else date.today())
    description = (payload.description if payload and payload.description else f"{item.title} ({target_date.strftime('%B %Y')})")
    period_key = target_date.strftime("%Y-%m")

    # Idempotency check: prevent duplicate generation in the same month
    existing_generated = db.query(Expense).filter(
        Expense.recurring_id == item.id,
        extract("year", Expense.expense_date) == target_date.year,
        extract("month", Expense.expense_date) == target_date.month
    ).first()
    if existing_generated:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An expense for '{item.title}' has already been generated for {target_date.strftime('%B %Y')}."
        )

    # Determine participating member IDs (ensuring all are currently active)
    parsed_ids = parse_split_members(item.split_members)
    active_members_query = db.query(Member.id).filter(Member.is_active == True)
    if parsed_ids:
        active_ids = [m[0] for m in active_members_query.filter(Member.id.in_(parsed_ids)).all()]
    else:
        active_ids = [m[0] for m in active_members_query.all()]

    if not active_ids:
        raise HTTPException(status_code=400, detail="No active members available to split this recurring expense.")

    split_records = compute_equal_splits(item.amount, active_ids)

    expense = Expense(
        category_id=item.category_id,
        amount=item.amount,
        paid_by=item.paid_by,
        description=description,
        expense_date=target_date,
        split_type=item.split_type or "equal",
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

    item.last_generated_period = period_key
    db.commit()
    db.refresh(expense)
    return expense

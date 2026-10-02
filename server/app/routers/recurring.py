import json
from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.recurring import RecurringExpense
from app.models.expense import Expense, ExpenseSplit
from app.models.member import Member
from app.models.category import Category
from app.schemas.recurring import RecurringCreate, RecurringUpdate, RecurringOut
from app.schemas.expense import ExpenseOut
from app.routers.expenses import compute_equal_splits

router = APIRouter(prefix="/api/recurring", tags=["Recurring Expenses"])

class CreateExpenseFromRecurringRequest(BaseModel):
    expense_date: Optional[date] = None
    description: Optional[str] = None

def parse_split_members(split_members_str: Optional[str]) -> List[int]:
    if not split_members_str:
        return []
    try:
        # Check if json or comma separated
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
def create_recurring(data: RecurringCreate, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")

    payer = db.query(Member).filter(Member.id == data.paid_by).first()
    if not payer:
        raise HTTPException(status_code=400, detail="Payer not found")

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
def update_recurring(recurring_id: int, data: RecurringUpdate, db: Session = Depends(get_db)):
    item = db.query(RecurringExpense).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")

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
def delete_recurring(recurring_id: int, db: Session = Depends(get_db)):
    item = db.query(RecurringExpense).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")
    db.delete(item)
    db.commit()
    return {"message": "Recurring expense template deleted successfully"}

@router.post("/{recurring_id}/create-expense", response_model=ExpenseOut)
def create_expense_from_recurring(
    recurring_id: int,
    payload: CreateExpenseFromRecurringRequest = None,
    db: Session = Depends(get_db)
):
    item = db.query(RecurringExpense).filter(RecurringExpense.id == recurring_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense template not found")

    target_date = (payload.expense_date if payload and payload.expense_date else date.today())
    description = (payload.description if payload and payload.description else f"{item.title} ({target_date.strftime('%B %Y')})")

    # Member IDs
    member_ids = parse_split_members(item.split_members)
    if not member_ids:
        # Default to all active members
        all_active = db.query(Member.id).filter(Member.is_active == True).all()
        member_ids = [m[0] for m in all_active]

    split_records = compute_equal_splits(item.amount, member_ids)

    expense = Expense(
        category_id=item.category_id,
        amount=item.amount,
        paid_by=item.paid_by,
        description=description,
        expense_date=target_date,
        split_type="equal",
        notes=item.notes
    )
    db.add(expense)
    db.flush()

    for mid, amt in split_records:
        split = ExpenseSplit(
            expense_id=expense.id,
            member_id=mid,
            amount=amt
        )
        db.add(split)

    db.commit()
    db.refresh(expense)
    return expense

from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import extract
from app.database import get_db
from app.models.expense import Expense, ExpenseSplit
from app.models.member import Member
from app.models.category import Category
from app.schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseOut

router = APIRouter(prefix="/api/expenses", tags=["Expenses"])

def compute_equal_splits(amount: Decimal, member_ids: List[int]) -> List[tuple[int, Decimal]]:
    n = len(member_ids)
    if n == 0:
        return []
    total_cents = int(round(amount * 100))
    base_cents = total_cents // n
    remainder_cents = total_cents % n

    result = []
    for idx, mid in enumerate(member_ids):
        cents = base_cents + (1 if idx < remainder_cents else 0)
        result.append((mid, Decimal(cents) / Decimal(100)))
    return result

@router.get("", response_model=List[ExpenseOut])
def get_expenses(
    category_id: Optional[int] = None,
    paid_by: Optional[int] = None,
    member_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    )

    if category_id:
        query = query.filter(Expense.category_id == category_id)
    if paid_by:
        query = query.filter(Expense.paid_by == paid_by)
    if year:
        query = query.filter(extract('year', Expense.expense_date) == year)
    if month:
        query = query.filter(extract('month', Expense.expense_date) == month)
    if start_date:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date:
        query = query.filter(Expense.expense_date <= end_date)
    if search:
        query = query.filter(Expense.description.ilike(f"%{search.strip()}%"))
    if member_id:
        query = query.join(Expense.splits).filter(ExpenseSplit.member_id == member_id)

    return query.order_by(Expense.expense_date.desc(), Expense.id.desc()).offset(offset).limit(limit).all()

@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    # Validate category and payer
    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Category not found")

    payer = db.query(Member).filter(Member.id == data.paid_by).first()
    if not payer:
        raise HTTPException(status_code=400, detail="Payer member not found")

    # Determine splits
    split_records: List[tuple[int, Decimal]] = []
    if data.split_type == "equal":
        member_ids = data.member_ids or ([s.member_id for s in data.splits] if data.splits else [])
        if not member_ids:
            raise HTTPException(status_code=400, detail="At least one member must be selected for equal split")
        # Validate that all member IDs exist
        existing_members = db.query(Member.id).filter(Member.id.in_(member_ids)).all()
        existing_ids = {m[0] for m in existing_members}
        for mid in member_ids:
            if mid not in existing_ids:
                raise HTTPException(status_code=400, detail=f"Member ID {mid} does not exist")
        split_records = compute_equal_splits(data.amount, member_ids)
    else: # custom split
        if not data.splits:
            raise HTTPException(status_code=400, detail="Custom splits must be specified")
        total_split = sum(s.amount for s in data.splits if s.amount is not None)
        if round(total_split, 2) != round(data.amount, 2):
            raise HTTPException(
                status_code=400,
                detail=f"Sum of splits (₹{total_split:.2f}) does not match expense amount (₹{data.amount:.2f})"
            )
        member_ids = [s.member_id for s in data.splits]
        existing_members = db.query(Member.id).filter(Member.id.in_(member_ids)).all()
        existing_ids = {m[0] for m in existing_members}
        for s in data.splits:
            if s.member_id not in existing_ids:
                raise HTTPException(status_code=400, detail=f"Member ID {s.member_id} does not exist")
            split_records.append((s.member_id, round(s.amount, 2)))

    # Category description validation:
    # General categories (like Grocery, Provisions) require a description.
    # Specific product categories (like LPG Gas, Electricity, WiFi, Maid) do not require a description and default to category name.
    GENERAL_CATEGORY_KEYWORDS = ["grocery", "groceries", "general", "supplies", "provisions", "other", "misc", "food", "market", "vegetable", "items"]
    cat_name_lower = (category.name or "").lower().strip()
    is_general = any(k in cat_name_lower for k in GENERAL_CATEGORY_KEYWORDS)

    clean_desc = (data.description or "").strip()
    if is_general and not clean_desc:
        raise HTTPException(
            status_code=422,
            detail=f"Description is mandatory for general categories like {category.name} (e.g. Vegetables, Milk, Oil)."
        )
    if not clean_desc:
        clean_desc = category.name

    expense = Expense(
        category_id=data.category_id,
        amount=round(data.amount, 2),
        paid_by=data.paid_by,
        description=clean_desc,
        expense_date=data.expense_date,
        billing_period_start=data.billing_period_start,
        billing_period_end=data.billing_period_end,
        receipt_url=data.receipt_url.strip() if data.receipt_url else None,
        split_type=data.split_type,
        notes=data.notes.strip() if data.notes else None
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

@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense

@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(expense_id: int, data: ExpenseUpdate, db: Session = Depends(get_db)):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    new_amount = round(data.amount, 2) if data.amount is not None else expense.amount
    new_split_type = data.split_type if data.split_type is not None else expense.split_type

    if data.category_id is not None:
        cat = db.query(Category).filter(Category.id == data.category_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Category not found")
        expense.category_id = data.category_id

    if data.paid_by is not None:
        payer = db.query(Member).filter(Member.id == data.paid_by).first()
        if not payer:
            raise HTTPException(status_code=400, detail="Payer not found")
        expense.paid_by = data.paid_by

    if data.description is not None:
        expense.description = data.description.strip()
    if data.expense_date is not None:
        expense.expense_date = data.expense_date
    if data.billing_period_start is not None:
        expense.billing_period_start = data.billing_period_start
    if data.billing_period_end is not None:
        expense.billing_period_end = data.billing_period_end
    if data.receipt_url is not None:
        expense.receipt_url = data.receipt_url.strip() if data.receipt_url else None
    if data.notes is not None:
        expense.notes = data.notes.strip() if data.notes else None

    expense.amount = new_amount
    expense.split_type = new_split_type

    # If splits or member_ids or amount changed
    if data.splits is not None or data.member_ids is not None or data.amount is not None:
        split_records: List[tuple[int, Decimal]] = []
        if new_split_type == "equal":
            if data.member_ids:
                member_ids = data.member_ids
            elif data.splits:
                member_ids = [s.member_id for s in data.splits]
            else:
                current_splits = db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).all()
                member_ids = [s.member_id for s in current_splits]
            if not member_ids:
                raise HTTPException(status_code=400, detail="At least one member required for split")
            split_records = compute_equal_splits(new_amount, member_ids)
        else: # custom
            if data.splits:
                splits_input = data.splits
            else:
                raise HTTPException(status_code=400, detail="Custom splits must be provided when updating to custom split")
            total_split = sum(s.amount for s in splits_input if s.amount is not None)
            if round(total_split, 2) != round(new_amount, 2):
                raise HTTPException(
                    status_code=400,
                    detail=f"Sum of splits (₹{total_split:.2f}) must equal expense amount (₹{new_amount:.2f})"
                )
            for s in splits_input:
                split_records.append((s.member_id, round(s.amount, 2)))

        # Remove old splits and replace
        db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).delete()
        for mid, amt in split_records:
            db.add(ExpenseSplit(expense_id=expense_id, member_id=mid, amount=amt))

    db.commit()
    db.refresh(expense)
    return expense

@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted successfully"}

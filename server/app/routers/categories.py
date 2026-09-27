from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from app.database import get_db
from app.models.category import Category
from app.models.expense import Expense
from app.models.member import Member
from app.models.payment import Payment
from app.models.recurring import RecurringExpense
from app.schemas.category import (
    CategoryCreate, 
    CategoryUpdate, 
    CategoryOut,
    CategoryBudgetStatus,
    MemberBudgetContribution,
    BudgetEqualizationTransfer,
    EqualizeBudgetRequest
)
from app.schemas.payment import PaymentOut
from app.routers.payments import attach_upi_link
from app.services.upi_service import generate_upi_link

router = APIRouter(prefix="/api/categories", tags=["Categories"])

@router.get("", response_model=List[CategoryOut])
def get_categories(include_inactive: bool = False, db: Session = Depends(get_db)):
    query = db.query(Category)
    if not include_inactive:
        query = query.filter(Category.is_active == True)
    return query.order_by(Category.name).all()

@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    clean_name = data.name.strip()
    existing = db.query(Category).filter(Category.name.ilike(clean_name)).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            existing.description = data.description.strip() if data.description else None
            existing.monthly_budget_per_member = data.monthly_budget_per_member
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail=f"Category '{clean_name}' already exists")

    category = Category(
        name=clean_name,
        description=data.description.strip() if data.description else None,
        monthly_budget_per_member=data.monthly_budget_per_member,
        is_active=True
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@router.get("/budget-status", response_model=List[CategoryBudgetStatus])
def get_categories_budget_status(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db)
):
    today = date.today()
    y = year or today.year
    m = month or today.month

    active_members = db.query(Member).filter(Member.is_active == True).order_by(Member.id).all()
    members_count = len(active_members)

    categories = db.query(Category).filter(Category.is_active == True).order_by(Category.name).all()

    # Expenses in this month grouped by (category_id, paid_by)
    expenses_query = db.query(
        Expense.category_id,
        Expense.paid_by,
        func.coalesce(func.sum(Expense.amount), 0).label("amount_paid")
    ).filter(
        extract("year", Expense.expense_date) == y,
        extract("month", Expense.expense_date) == m
    ).group_by(Expense.category_id, Expense.paid_by).all()

    # Map (category_id, member_id) -> amount_paid
    cat_member_paid = {}
    cat_total_spent = {}
    for row in expenses_query:
        c_id, mem_id, amt = row[0], row[1], Decimal(str(row[2]))
        cat_member_paid[(c_id, mem_id)] = amt
        cat_total_spent[c_id] = cat_total_spent.get(c_id, Decimal("0.00")) + amt

    results = []

    for cat in categories:
        target_per_member = cat.monthly_budget_per_member
        total_spent = cat_total_spent.get(cat.id, Decimal("0.00"))
        total_budget = (target_per_member * members_count) if (target_per_member and members_count > 0) else None

        member_contribs = []
        debtors = []
        creditors = []

        # Benchmark for Member Contribution Diff vs Target
        budget_benchmark = target_per_member if target_per_member is not None else (
            round(total_spent / members_count, 2) if members_count > 0 else Decimal("0.00")
        )

        for mem in active_members:
            amt_paid = cat_member_paid.get((cat.id, mem.id), Decimal("0.00"))
            diff = amt_paid - budget_benchmark

            member_contribs.append(MemberBudgetContribution(
                member_id=mem.id,
                member_name=mem.name,
                upi_id=mem.upi_id,
                amount_paid=amt_paid,
                target_budget=target_per_member,
                diff_from_target=round(diff, 2)
            ))

        # Benchmark for Equalization Transfers:
        # If target budget is set AND some members are below budget while others are above,
        # benchmark against target budget (e.g. 1500).
        # If all members are over budget (or all under budget), equalize against average actual spend.
        has_under = target_per_member is not None and any(cat_member_paid.get((cat.id, m.id), Decimal("0.00")) < (target_per_member - Decimal("0.01")) for m in active_members)
        has_over = target_per_member is not None and any(cat_member_paid.get((cat.id, m.id), Decimal("0.00")) > (target_per_member + Decimal("0.01")) for m in active_members)

        if target_per_member is not None and has_under and has_over:
            eq_benchmark = target_per_member
            reason_suffix = f"to equalize {cat.name} budget"
        else:
            eq_benchmark = round(total_spent / members_count, 2) if members_count > 0 else Decimal("0.00")
            reason_suffix = f"to equalize {cat.name} spending"

        debtors = []
        creditors = []
        for mem in active_members:
            amt_paid = cat_member_paid.get((cat.id, mem.id), Decimal("0.00"))
            eq_diff = amt_paid - eq_benchmark
            if eq_diff < Decimal("-0.01"):
                debtors.append({
                    "id": mem.id,
                    "name": mem.name,
                    "deficit": abs(eq_diff)
                })
            elif eq_diff > Decimal("0.01"):
                creditors.append({
                    "id": mem.id,
                    "name": mem.name,
                    "upi": mem.upi_id,
                    "surplus": eq_diff
                })

        # Calculate equalization transfers
        equalization_transfers = []
        debtors.sort(key=lambda x: x["deficit"], reverse=True)
        creditors.sort(key=lambda x: x["surplus"], reverse=True)

        di, ci = 0, 0
        while di < len(debtors) and ci < len(creditors):
            d = debtors[di]
            c = creditors[ci]
            transfer_amt = min(d["deficit"], c["surplus"])
            transfer_amt = round(transfer_amt, 2)

            if transfer_amt > Decimal("0.00"):
                upi_link = None
                if c["upi"]:
                    upi_link = generate_upi_link(
                        upi_id=c["upi"],
                        payee_name=c["name"],
                        amount=transfer_amt,
                        transaction_note=f"Budget Equalization for {cat.name}"
                    )
                equalization_transfers.append(BudgetEqualizationTransfer(
                    from_member_id=d["id"],
                    from_member_name=d["name"],
                    to_member_id=c["id"],
                    to_member_name=c["name"],
                    to_member_upi=c["upi"],
                    amount=transfer_amt,
                    reason=f"{d['name']} pays {c['name']} ₹{transfer_amt} to equalize {cat.name} budget",
                    upi_link=upi_link
                ))

            d["deficit"] -= transfer_amt
            c["surplus"] -= transfer_amt
            if d["deficit"] <= Decimal("0.01"):
                di += 1
            if c["surplus"] <= Decimal("0.01"):
                ci += 1

        results.append(CategoryBudgetStatus(
            category_id=cat.id,
            category_name=cat.name,
            monthly_budget_per_member=cat.monthly_budget_per_member,
            total_budget=total_budget,
            total_spent=total_spent,
            members_count=members_count,
            member_contributions=member_contribs,
            equalization_transfers=equalization_transfers
        ))

    return results

@router.post("/equalize-budget", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def equalize_budget(data: EqualizeBudgetRequest, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == data.category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    payer = db.query(Member).filter(Member.id == data.from_member_id).first()
    receiver = db.query(Member).filter(Member.id == data.to_member_id).first()
    if not payer or not receiver:
        raise HTTPException(status_code=400, detail="Invalid payer or receiver")

    today = date.today()
    note = data.notes or f"Budget Equalization for {cat.name}: {payer.name} to {receiver.name}"

    payment = Payment(
        from_member=data.from_member_id,
        to_member=data.to_member_id,
        amount=round(data.amount, 2),
        payment_date=today,
        status="Paid",
        payment_method=data.payment_method or "UPI",
        transaction_reference=data.transaction_reference.strip() if data.transaction_reference else None,
        notes=note,
        verified_at=datetime.now()
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return attach_upi_link(payment)

@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if data.name is not None:
        name_clean = data.name.strip()
        existing = db.query(Category).filter(
            Category.name.ilike(name_clean), Category.id != category_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Category '{name_clean}' already exists")
        category.name = name_clean

    if data.description is not None:
        category.description = data.description.strip() if data.description else None
    if data.monthly_budget_per_member is not None:
        category.monthly_budget_per_member = data.monthly_budget_per_member
    if data.is_active is not None:
        category.is_active = data.is_active

    db.commit()
    db.refresh(category)
    return category

@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    has_expenses = db.query(Expense).filter(Expense.category_id == category_id).count() > 0
    has_recurring = db.query(RecurringExpense).filter(RecurringExpense.category_id == category_id).count() > 0

    if has_expenses or has_recurring:
        category.is_active = False
        db.commit()
        return {
            "message": f"Category '{category.name}' has historical transactions and was deactivated.",
            "soft_deleted": True
        }

    db.delete(category)
    db.commit()
    return {"message": f"Category '{category.name}' deleted successfully", "soft_deleted": False}

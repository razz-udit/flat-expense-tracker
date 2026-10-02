import calendar
from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract
from app.database import get_db
from app.models.expense import Expense, ExpenseSplit
from app.models.category import Category
from app.models.member import Member
from app.models.payment import Payment
from app.models.recurring import RecurringExpense
from app.schemas.dashboard import (
    DashboardStats,
    MemberBalanceOut,
    SettlementRecommendation,
    CategoryBreakdownItem,
    MemberContributionItem,
    MemberShareItem,
    MonthItem,
    MonthlyDetailOut
)
from app.schemas.expense import ExpenseOut
from app.routers.payments import attach_upi_link
from app.services.balance_service import calculate_all_balances, calculate_settlements
from app.services.seed_service import seed_initial_data

router = APIRouter(prefix="/api", tags=["Dashboard & Analytics"])

@router.get("/balances", response_model=List[MemberBalanceOut])
def get_balances(db: Session = Depends(get_db)):
    return calculate_all_balances(db)

@router.get("/settlements", response_model=List[SettlementRecommendation])
def get_settlements(db: Session = Depends(get_db)):
    balances = calculate_all_balances(db)
    return calculate_settlements(balances)

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard(
    viewer_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db)
):
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month

    # Check if there are any expenses in this month; if not and year/month were not explicitly passed,
    # pick the latest month with expenses
    if year is None and month is None:
        latest_expense = db.query(Expense.expense_date).order_by(Expense.expense_date.desc()).first()
        if latest_expense and latest_expense[0]:
            target_year = latest_expense[0].year
            target_month = latest_expense[0].month

    month_name = f"{calendar.month_name[target_month]} {target_year}"

    # Month expenses total
    month_exp_sum = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
        extract('year', Expense.expense_date) == target_year,
        extract('month', Expense.expense_date) == target_month
    ).scalar() or Decimal("0.00")
    month_expenses_total = Decimal(str(month_exp_sum))

    # All-time expenses total
    all_time_sum = db.query(func.coalesce(func.sum(Expense.amount), 0)).scalar() or Decimal("0.00")
    flat_all_time_expenses = Decimal(str(all_time_sum))

    # All balances & settlements
    balances = calculate_all_balances(db)
    suggested_settlements = calculate_settlements(balances)

    # Pending recorded payments
    pending_records = db.query(Payment).options(
        joinedload(Payment.payer),
        joinedload(Payment.receiver)
    ).filter(Payment.status == "Pending").order_by(Payment.payment_date.desc()).all()
    pending_payments = [attach_upi_link(p) for p in pending_records]

    # Recent expenses
    recent_exp_records = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).order_by(Expense.expense_date.desc(), Expense.id.desc()).limit(8).all()
    recent_expenses = [ExpenseOut.model_validate(e) for e in recent_exp_records]

    # Category breakdown for this month
    cat_query = db.query(
        Category.id,
        Category.name,
        func.coalesce(func.sum(Expense.amount), 0).label("total_amt"),
        func.count(Expense.id).label("exp_cnt")
    ).join(Expense, Expense.category_id == Category.id).filter(
        extract('year', Expense.expense_date) == target_year,
        extract('month', Expense.expense_date) == target_month
    ).group_by(Category.id, Category.name).order_by(func.sum(Expense.amount).desc()).all()

    category_breakdown: List[CategoryBreakdownItem] = []
    for c_id, c_name, c_amt, c_cnt in cat_query:
        amt = Decimal(str(c_amt))
        pct = Decimal("0.00")
        if month_expenses_total > 0:
            pct = round((amt / month_expenses_total) * Decimal("100"), 1)
        category_breakdown.append(CategoryBreakdownItem(
            category_id=c_id,
            category_name=c_name,
            total_amount=amt,
            percentage=pct,
            expense_count=c_cnt
        ))

    # Viewer stats
    viewer_name = None
    viewer_paid = Decimal("0.00")
    viewer_share = Decimal("0.00")
    viewer_net_balance = Decimal("0.00")
    viewer_owes_to: List[SettlementRecommendation] = []
    viewer_receivable_from: List[SettlementRecommendation] = []

    if viewer_id:
        viewer_member = db.query(Member).filter(Member.id == viewer_id).first()
        if viewer_member:
            viewer_name = viewer_member.name

            # What viewer paid this month
            vp = db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
                Expense.paid_by == viewer_id,
                extract('year', Expense.expense_date) == target_year,
                extract('month', Expense.expense_date) == target_month
            ).scalar() or 0
            viewer_paid = Decimal(str(vp))

            # What viewer owed in splits this month
            vs = db.query(func.coalesce(func.sum(ExpenseSplit.amount), 0)).join(
                Expense, Expense.id == ExpenseSplit.expense_id
            ).filter(
                ExpenseSplit.member_id == viewer_id,
                extract('year', Expense.expense_date) == target_year,
                extract('month', Expense.expense_date) == target_month
            ).scalar() or 0
            viewer_share = Decimal(str(vs))

            # Viewer net balance (from all-time balances)
            for b in balances:
                if b.member_id == viewer_id:
                    viewer_net_balance = b.net_balance
                    break

            for s in suggested_settlements:
                if s.from_member_id == viewer_id:
                    viewer_owes_to.append(s)
                elif s.to_member_id == viewer_id:
                    viewer_receivable_from.append(s)

    # Active members count
    active_members_count = db.query(Member).filter(Member.is_active == True).count() or 1

    return DashboardStats(
        current_month_name=month_name,
        current_year=target_year,
        current_month=target_month,
        month_expenses_total=month_expenses_total,
        flat_all_time_expenses=flat_all_time_expenses,
        active_members_count=active_members_count,
        viewer_id=viewer_id,
        viewer_name=viewer_name,
        viewer_paid=viewer_paid,
        viewer_share=viewer_share,
        viewer_net_balance=viewer_net_balance,
        viewer_owes_to=viewer_owes_to,
        viewer_receivable_from=viewer_receivable_from,
        balances=balances,
        suggested_settlements=suggested_settlements,
        pending_payments=pending_payments,
        recent_expenses=recent_expenses,
        category_breakdown=category_breakdown
    )

@router.get("/monthly-history", response_model=List[MonthItem])
def get_monthly_history(db: Session = Depends(get_db)):
    months_query = db.query(
        extract('year', Expense.expense_date).label("exp_year"),
        extract('month', Expense.expense_date).label("exp_month"),
        func.sum(Expense.amount).label("total_amt"),
        func.count(Expense.id).label("exp_count")
    ).group_by(
        extract('year', Expense.expense_date),
        extract('month', Expense.expense_date)
    ).order_by(
        extract('year', Expense.expense_date).desc(),
        extract('month', Expense.expense_date).desc()
    ).all()

    result: List[MonthItem] = []
    for y, m, amt, count in months_query:
        y_int = int(y)
        m_int = int(m)
        m_name = f"{calendar.month_name[m_int]} {y_int}"
        result.append(MonthItem(
            year=y_int,
            month=m_int,
            month_name=m_name,
            total_amount=Decimal(str(amt)),
            expense_count=count
        ))
    return result

@router.get("/monthly-summary/{year}/{month}", response_model=MonthlyDetailOut)
def get_monthly_summary(year: int, month: int, db: Session = Depends(get_db)):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month (must be 1-12)")

    month_name = f"{calendar.month_name[month]} {year}"

    expenses_query = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).filter(
        extract('year', Expense.expense_date) == year,
        extract('month', Expense.expense_date) == month
    ).order_by(Expense.expense_date.desc(), Expense.id.desc()).all()

    total_amount = sum((e.amount for e in expenses_query), Decimal("0.00"))
    expense_count = len(expenses_query)

    # Categories breakdown
    cat_query = db.query(
        Category.id,
        Category.name,
        func.coalesce(func.sum(Expense.amount), 0).label("total_amt"),
        func.count(Expense.id).label("exp_cnt")
    ).join(Expense, Expense.category_id == Category.id).filter(
        extract('year', Expense.expense_date) == year,
        extract('month', Expense.expense_date) == month
    ).group_by(Category.id, Category.name).order_by(func.sum(Expense.amount).desc()).all()

    categories: List[CategoryBreakdownItem] = []
    for c_id, c_name, c_amt, c_cnt in cat_query:
        amt = Decimal(str(c_amt))
        pct = Decimal("0.00")
        if total_amount > 0:
            pct = round((amt / total_amount) * Decimal("100"), 1)
        categories.append(CategoryBreakdownItem(
            category_id=c_id,
            category_name=c_name,
            total_amount=amt,
            percentage=pct,
            expense_count=c_cnt
        ))

    # Member contributions (Paid By)
    contrib_query = db.query(
        Member.id,
        Member.name,
        func.coalesce(func.sum(Expense.amount), 0).label("paid_amt")
    ).join(Expense, Expense.paid_by == Member.id).filter(
        extract('year', Expense.expense_date) == year,
        extract('month', Expense.expense_date) == month
    ).group_by(Member.id, Member.name).order_by(func.sum(Expense.amount).desc()).all()

    contributions: List[MemberContributionItem] = []
    for m_id, m_name, m_amt in contrib_query:
        amt = Decimal(str(m_amt))
        pct = round((amt / total_amount) * Decimal("100"), 1) if total_amount > 0 else Decimal("0.00")
        contributions.append(MemberContributionItem(
            member_id=m_id,
            member_name=m_name,
            amount_paid=amt,
            percentage=pct
        ))

    # Member shares (Splits)
    share_query = db.query(
        Member.id,
        Member.name,
        func.coalesce(func.sum(ExpenseSplit.amount), 0).label("share_amt")
    ).join(ExpenseSplit, ExpenseSplit.member_id == Member.id).join(
        Expense, Expense.id == ExpenseSplit.expense_id
    ).filter(
        extract('year', Expense.expense_date) == year,
        extract('month', Expense.expense_date) == month
    ).group_by(Member.id, Member.name).order_by(func.sum(ExpenseSplit.amount).desc()).all()

    shares: List[MemberShareItem] = []
    for m_id, m_name, s_amt in share_query:
        amt = Decimal(str(s_amt))
        pct = round((amt / total_amount) * Decimal("100"), 1) if total_amount > 0 else Decimal("0.00")
        shares.append(MemberShareItem(
            member_id=m_id,
            member_name=m_name,
            amount_owed=amt,
            percentage=pct
        ))

    return MonthlyDetailOut(
        year=year,
        month=month,
        month_name=month_name,
        total_amount=total_amount,
        expense_count=expense_count,
        categories=categories,
        contributions=contributions,
        shares=shares,
        expenses=[ExpenseOut.model_validate(e) for e in expenses_query]
    )

@router.post("/reset-data")
def reset_all_data(db: Session = Depends(get_db)):
    """Clears all expenses, splits, and payments. Keeps members and categories."""
    db.query(ExpenseSplit).delete()
    db.query(Expense).delete()
    db.query(Payment).delete()
    db.commit()
    seed_initial_data(db)
    return {"message": "Flat database reset to clean state with 6 members and 11 categories."}

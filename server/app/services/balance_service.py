from decimal import Decimal
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.member import Member
from app.models.expense import Expense, ExpenseSplit
from app.models.payment import Payment
from app.schemas.dashboard import MemberBalanceOut, SettlementRecommendation
from app.services.upi_service import generate_upi_link

def calculate_all_balances(db: Session, member_id: Optional[int] = None) -> List[MemberBalanceOut]:
    members_query = db.query(Member)
    if member_id:
        members_query = members_query.filter(Member.id == member_id)
    else:
        members_query = members_query.order_by(Member.id)
    
    members = members_query.all()

    # Total expenses paid by each member
    paid_query = db.query(
        Expense.paid_by,
        func.coalesce(func.sum(Expense.amount), 0).label("total_paid")
    ).group_by(Expense.paid_by).all()
    paid_map: Dict[int, Decimal] = {p[0]: Decimal(str(p[1])) for p in paid_query}

    # Total share owed in expenses by each member
    owed_query = db.query(
        ExpenseSplit.member_id,
        func.coalesce(func.sum(ExpenseSplit.amount), 0).label("total_owed")
    ).group_by(ExpenseSplit.member_id).all()
    owed_map: Dict[int, Decimal] = {o[0]: Decimal(str(o[1])) for o in owed_query}

    # Settlements paid (from_member) where status == 'Paid'
    settle_paid_query = db.query(
        Payment.from_member,
        func.coalesce(func.sum(Payment.amount), 0).label("settlements_paid")
    ).filter(Payment.status == "Paid").group_by(Payment.from_member).all()
    settle_paid_map: Dict[int, Decimal] = {sp[0]: Decimal(str(sp[1])) for sp in settle_paid_query}

    # Settlements received (to_member) where status == 'Paid'
    settle_recv_query = db.query(
        Payment.to_member,
        func.coalesce(func.sum(Payment.amount), 0).label("settlements_received")
    ).filter(Payment.status == "Paid").group_by(Payment.to_member).all()
    settle_recv_map: Dict[int, Decimal] = {sr[0]: Decimal(str(sr[1])) for sr in settle_recv_query}

    result: List[MemberBalanceOut] = []

    for m in members:
        t_paid = paid_map.get(m.id, Decimal("0.00"))
        t_owed = owed_map.get(m.id, Decimal("0.00"))
        s_paid = settle_paid_map.get(m.id, Decimal("0.00"))
        s_recv = settle_recv_map.get(m.id, Decimal("0.00"))

        net_bal = (t_paid + s_paid) - (t_owed + s_recv)
        net_bal = round(net_bal, 2)

        if net_bal > Decimal("0.01"):
            status = "Receivable"
        elif net_bal < Decimal("-0.01"):
            status = "Owes"
        else:
            status = "Settled"
            net_bal = Decimal("0.00")

        result.append(MemberBalanceOut(
            member_id=m.id,
            member_name=m.name,
            upi_id=m.upi_id,
            is_active=m.is_active,
            total_paid=t_paid,
            total_owed=t_owed,
            settlements_paid=s_paid,
            settlements_received=s_recv,
            net_balance=net_bal,
            status=status
        ))

    return result

def calculate_settlements(balances: List[MemberBalanceOut]) -> List[SettlementRecommendation]:
    """
    Minimizes cross debt transactions by matching debtors with creditors
    """
    debtors = []
    creditors = []

    for b in balances:
        if b.net_balance < Decimal("-0.01"):
            debtors.append({
                "id": b.member_id,
                "name": b.member_name,
                "upi": b.upi_id,
                "amount": abs(b.net_balance)
            })
        elif b.net_balance > Decimal("0.01"):
            creditors.append({
                "id": b.member_id,
                "name": b.member_name,
                "upi": b.upi_id,
                "amount": b.net_balance
            })

    # Sort descending by amount to greedily pair largest debts
    debtors.sort(key=lambda x: x["amount"], reverse=True)
    creditors.sort(key=lambda x: x["amount"], reverse=True)

    recommendations: List[SettlementRecommendation] = []
    i, j = 0, 0

    while i < len(debtors) and j < len(creditors):
        debtor = debtors[i]
        creditor = creditors[j]

        settle_amount = min(debtor["amount"], creditor["amount"])
        settle_amount = round(settle_amount, 2)

        if settle_amount > Decimal("0.00"):
            upi_link = generate_upi_link(
                upi_id=creditor["upi"],
                payee_name=creditor["name"],
                amount=settle_amount,
                transaction_note=f"Flat Settlement to {creditor['name']}"
            )
            recommendations.append(SettlementRecommendation(
                from_member_id=debtor["id"],
                from_member_name=debtor["name"],
                to_member_id=creditor["id"],
                to_member_name=creditor["name"],
                to_member_upi=creditor["upi"],
                amount=settle_amount,
                upi_link=upi_link
            ))

        debtor["amount"] -= settle_amount
        creditor["amount"] -= settle_amount

        if debtor["amount"] <= Decimal("0.01"):
            i += 1
        if creditor["amount"] <= Decimal("0.01"):
            j += 1

    return recommendations

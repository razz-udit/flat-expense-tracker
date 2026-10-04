import os
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import extract
from app.database import get_db
from app.models.expense import Expense, ExpenseSplit
from app.models.member import Member
from app.models.category import Category
from app.schemas.expense import (
    ExpenseCreate, 
    ExpenseUpdate, 
    ExpenseOut, 
    ExpenseEvaluationInput,
    DisputeExpenseRequest,
    ResolveDisputeRequest
)
from app.dependencies import get_current_user, require_admin
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/expenses", tags=["Expenses"])

def compute_equal_splits(amount: Decimal, member_ids: List[int]) -> List[Tuple[int, Decimal, Optional[Decimal], Optional[Decimal]]]:
    n = len(member_ids)
    if n == 0:
        return []
    total_cents = int(round(amount * 100))
    base_cents = total_cents // n
    remainder_cents = total_cents % n

    result = []
    for idx, mid in enumerate(member_ids):
        cents = base_cents + (1 if idx < remainder_cents else 0)
        result.append((mid, Decimal(cents) / Decimal(100), None, None))
    return result

def compute_percentage_splits(amount: Decimal, splits_data: list) -> List[Tuple[int, Decimal, Optional[Decimal], Optional[Decimal]]]:
    total_cents = int(round(amount * 100))
    allocated_cents = 0
    temp_results = []
    for s in splits_data:
        pct = getattr(s, "percentage", None) or Decimal("0.00")
        if getattr(s, "amount", None) is not None:
            cents = int(round(s.amount * 100))
        else:
            cents = int(round(Decimal(total_cents) * (pct / Decimal("100"))))
        temp_results.append([s.member_id, cents, None, pct])
        allocated_cents += cents

    diff = total_cents - allocated_cents
    if diff != 0 and temp_results:
        max_idx = max(range(len(temp_results)), key=lambda i: temp_results[i][3] or 0)
        temp_results[max_idx][1] += diff

    return [(mid, Decimal(cents) / Decimal(100), sh, pct) for mid, cents, sh, pct in temp_results]

def compute_shares_splits(amount: Decimal, splits_data: list) -> List[Tuple[int, Decimal, Optional[Decimal], Optional[Decimal]]]:
    total_cents = int(round(amount * 100))
    total_shares = sum((getattr(s, "shares", None) or Decimal("1.00")) for s in splits_data)
    if total_shares <= 0:
        total_shares = Decimal(len(splits_data))

    allocated_cents = 0
    temp_results = []
    for s in splits_data:
        sh = getattr(s, "shares", None) or Decimal("1.00")
        if getattr(s, "amount", None) is not None:
            cents = int(round(s.amount * 100))
        else:
            cents = int(round(Decimal(total_cents) * (sh / total_shares)))
        temp_results.append([s.member_id, cents, sh, None])
        allocated_cents += cents

    diff = total_cents - allocated_cents
    if diff != 0 and temp_results:
        max_idx = max(range(len(temp_results)), key=lambda i: temp_results[i][2] or 0)
        temp_results[max_idx][1] += diff

    return [(mid, Decimal(cents) / Decimal(100), sh, pct) for mid, cents, sh, pct in temp_results]

def validate_split_members_active(member_ids: List[int], db: Session):
    if len(member_ids) != len(set(member_ids)):
        raise HTTPException(
            status_code=400,
            detail="Duplicate member specified in split configuration."
        )
    active_members = db.query(Member.id).filter(Member.id.in_(member_ids), Member.is_active == True).all()
    active_set = {m[0] for m in active_members}
    for mid in member_ids:
        if mid not in active_set:
            raise HTTPException(
                status_code=400,
                detail=f"Member ID {mid} does not exist or is inactive. Inactive members cannot participate in new expenses."
            )

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
    payment_method: Optional[str] = None,
    verification_status: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: Member = Depends(get_current_user),
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
    if payment_method:
        query = query.filter(Expense.payment_method == payment_method)
    if verification_status:
        query = query.filter(Expense.verification_status == verification_status)
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
def create_expense(
    data: ExpenseCreate, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Only payer themselves or admin can record
    if current_user.id != data.paid_by and not getattr(current_user, "is_admin", False):
        target_member = db.query(Member).filter(Member.id == data.paid_by).first()
        target_name = target_member.name if target_member else f"Member {data.paid_by}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: You are logged in as {current_user.name}. You cannot record an expense paid by {target_name}."
        )

    payer = db.query(Member).filter(Member.id == data.paid_by).first()
    if not payer:
        raise HTTPException(status_code=400, detail="Payer member not found")
    if not payer.is_active:
        raise HTTPException(status_code=400, detail=f"Member '{payer.name}' is inactive and cannot record new expenses.")

    try:
        # Validate category atomically
        category = None
        if data.category_id:
            category = db.query(Category).filter(Category.id == data.category_id).first()
            if not category:
                raise HTTPException(status_code=400, detail="Category not found")
            if not category.is_active:
                raise HTTPException(status_code=400, detail=f"Category '{category.name}' is inactive and cannot be used for new expenses.")
        elif data.category_name and data.category_name.strip():
            cat_name = data.category_name.strip()
            category = db.query(Category).filter(Category.name.ilike(cat_name)).first()
            if not category:
                category = Category(name=cat_name, is_active=True)
                db.add(category)
                db.flush()
            elif not category.is_active:
                category.is_active = True
                db.flush()

        if not category:
            raise HTTPException(status_code=400, detail="Category not found or invalid category name provided")

        # Determine splits with active member verification and duplication checks
        split_records: List[Tuple[int, Decimal, Optional[Decimal], Optional[Decimal]]] = []
        if data.split_type == "equal":
            member_ids = data.member_ids or ([s.member_id for s in data.splits] if data.splits else [])
            if not member_ids:
                raise HTTPException(status_code=400, detail="At least one member must be selected for equal split")
            validate_split_members_active(member_ids, db)
            split_records = compute_equal_splits(data.amount, member_ids)
        elif data.split_type == "percentage":
            if not data.splits:
                raise HTTPException(status_code=400, detail="Percentage splits must be specified")
            member_ids = [s.member_id for s in data.splits]
            validate_split_members_active(member_ids, db)
            split_records = compute_percentage_splits(data.amount, data.splits)
        elif data.split_type == "shares":
            if not data.splits:
                raise HTTPException(status_code=400, detail="Shares splits must be specified")
            member_ids = [s.member_id for s in data.splits]
            validate_split_members_active(member_ids, db)
            split_records = compute_shares_splits(data.amount, data.splits)
        else: # custom or exact split
            if not data.splits:
                raise HTTPException(status_code=400, detail="Custom splits must be specified")
            total_split = sum(s.amount for s in data.splits if s.amount is not None)
            if round(total_split, 2) != round(data.amount, 2):
                raise HTTPException(
                    status_code=400,
                    detail=f"Sum of splits (₹{total_split:.2f}) does not match expense amount (₹{data.amount:.2f})"
                )
            member_ids = [s.member_id for s in data.splits]
            validate_split_members_active(member_ids, db)
            for s in data.splits:
                split_records.append((s.member_id, round(s.amount, 2), s.shares, s.percentage))

        # Description validation
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
            category_id=category.id,
            amount=round(data.amount, 2),
            paid_by=data.paid_by,
            description=clean_desc,
            expense_date=data.expense_date,
            billing_period_start=data.billing_period_start,
            billing_period_end=data.billing_period_end,
            receipt_url=data.receipt_url.strip() if data.receipt_url else None,
            payment_method=(data.payment_method or "UPI").strip(),
            verification_status=(data.verification_status or "Pending Confirmation").strip(),
            confirmed_by=data.confirmed_by or "",
            split_type=data.split_type,
            notes=data.notes.strip() if data.notes else None
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

        db.commit()
        db.refresh(expense)

        log_audit(db, "expense.created", member_id=current_user.id, details={"expense_id": expense.id, "amount": str(expense.amount)})

        return expense
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create expense: {str(e)}")

@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: int, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    return expense

@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int, 
    data: ExpenseUpdate, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).options(
        joinedload(Expense.payer)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if current_user.id != expense.paid_by and not getattr(current_user, "is_admin", False):
        payer_name = expense.payer.name if expense.payer else f"Member {expense.paid_by}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: You cannot edit this expense because it was paid by {payer_name}."
        )

    if data.paid_by is not None and data.paid_by != expense.paid_by and not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: You cannot change the payer of an expense."
        )

    new_amount = round(data.amount, 2) if data.amount is not None else expense.amount
    new_split_type = data.split_type if data.split_type is not None else expense.split_type

    if data.category_id is not None:
        cat = db.query(Category).filter(Category.id == data.category_id).first()
        if not cat:
            raise HTTPException(status_code=400, detail="Category not found")
        if not cat.is_active:
            raise HTTPException(status_code=400, detail="Selected category is inactive.")
        expense.category_id = data.category_id
    elif data.category_name and data.category_name.strip():
        cat_name = data.category_name.strip()
        cat = db.query(Category).filter(Category.name.ilike(cat_name)).first()
        if not cat:
            cat = Category(name=cat_name, is_active=True)
            db.add(cat)
            db.flush()
        elif not cat.is_active:
            cat.is_active = True
            db.flush()
        expense.category_id = cat.id

    if data.paid_by is not None:
        payer = db.query(Member).filter(Member.id == data.paid_by).first()
        if not payer:
            raise HTTPException(status_code=400, detail="Payer not found")
        if not payer.is_active:
            raise HTTPException(status_code=400, detail="Payer is inactive.")
        expense.paid_by = data.paid_by

    if "description" in data.model_fields_set and data.description is not None:
        expense.description = data.description.strip()
    if "expense_date" in data.model_fields_set and data.expense_date is not None:
        expense.expense_date = data.expense_date
    if "payment_method" in data.model_fields_set and data.payment_method is not None:
        expense.payment_method = data.payment_method.strip()
    if "verification_status" in data.model_fields_set and data.verification_status is not None:
        expense.verification_status = data.verification_status.strip()
    if "confirmed_by" in data.model_fields_set and data.confirmed_by is not None:
        expense.confirmed_by = data.confirmed_by

    if "billing_period_start" in data.model_fields_set:
        expense.billing_period_start = data.billing_period_start
    if "billing_period_end" in data.model_fields_set:
        expense.billing_period_end = data.billing_period_end
    if "receipt_url" in data.model_fields_set:
        expense.receipt_url = data.receipt_url.strip() if data.receipt_url else None
    if "notes" in data.model_fields_set:
        expense.notes = data.notes.strip() if data.notes else None

    expense.amount = new_amount
    expense.split_type = new_split_type

    # Recompute splits if splits, member_ids, or amount changed
    if data.splits is not None or data.member_ids is not None or data.amount is not None:
        split_records: List[Tuple[int, Decimal, Optional[Decimal], Optional[Decimal]]] = []
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
            validate_split_members_active(member_ids, db)
            split_records = compute_equal_splits(new_amount, member_ids)
        elif new_split_type == "percentage":
            splits_input = data.splits or []
            if not splits_input:
                raise HTTPException(status_code=400, detail="Percentage splits must be provided")
            member_ids = [s.member_id for s in splits_input]
            validate_split_members_active(member_ids, db)
            split_records = compute_percentage_splits(new_amount, splits_input)
        elif new_split_type == "shares":
            splits_input = data.splits or []
            if not splits_input:
                raise HTTPException(status_code=400, detail="Shares splits must be provided")
            member_ids = [s.member_id for s in splits_input]
            validate_split_members_active(member_ids, db)
            split_records = compute_shares_splits(new_amount, splits_input)
        else: # custom or exact
            splits_input = data.splits or []
            if not splits_input:
                raise HTTPException(status_code=400, detail="Custom splits must be provided")
            total_split = sum(s.amount for s in splits_input if s.amount is not None)
            if round(total_split, 2) != round(new_amount, 2):
                raise HTTPException(
                    status_code=400,
                    detail=f"Sum of splits (₹{total_split:.2f}) must equal expense amount (₹{new_amount:.2f})"
                )
            member_ids = [s.member_id for s in splits_input]
            validate_split_members_active(member_ids, db)
            for s in splits_input:
                split_records.append((s.member_id, round(s.amount, 2), s.shares, s.percentage))

        # Replace existing splits atomically
        db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).delete()
        for mid, amt, sh, pct in split_records:
            db.add(ExpenseSplit(expense_id=expense_id, member_id=mid, amount=amt, shares=sh, percentage=pct))

    db.commit()
    db.refresh(expense)

    log_audit(db, "expense.updated", member_id=current_user.id, details={"expense_id": expense.id})

    return expense

@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int, 
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).options(
        joinedload(Expense.payer)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if current_user.id != expense.paid_by and not getattr(current_user, "is_admin", False):
        payer_name = expense.payer.name if expense.payer else f"Member {expense.paid_by}"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission denied: You cannot delete this expense because it was paid by {payer_name}."
        )

    log_audit(db, "expense.deleted", member_id=current_user.id, details={"expense_id": expense.id, "amount": str(expense.amount)})

    db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).delete()
    db.delete(expense)
    db.commit()
    return {"message": "Expense deleted successfully"}

@router.post("/{expense_id}/evaluate", response_model=ExpenseOut)
def evaluate_expense(
    expense_id: int,
    data: ExpenseEvaluationInput,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    if data.action == "confirm":
        current_confirmed = [int(x.strip()) for x in (expense.confirmed_by or "").split(",") if x.strip().isdigit()]
        if current_user.id not in current_confirmed:
            current_confirmed.append(current_user.id)
        expense.confirmed_by = ",".join(map(str, current_confirmed))
        expense.verification_status = "Confirmed"
    elif data.action == "dispute":
        expense.verification_status = "Disputed / Flagged"
        note_entry = f"[Disputed by {current_user.name}: {data.notes or 'Suspected false expense'}]"
        expense.notes = f"{expense.notes}\n{note_entry}".strip() if expense.notes else note_entry

    db.commit()
    db.refresh(expense)

    log_audit(db, f"expense.{data.action}", member_id=current_user.id, details={"expense_id": expense.id})

    return expense

@router.post("/{expense_id}/dispute", response_model=ExpenseOut)
def dispute_expense(
    expense_id: int,
    data: DisputeExpenseRequest,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    clean_reason = data.reason.strip()
    expense.verification_status = "Disputed / Flagged"
    expense.disputed_by = current_user.id
    expense.dispute_reason = clean_reason
    expense.disputed_at = datetime.now()

    note_entry = f"[Disputed by {current_user.name}: {clean_reason}]"
    expense.notes = f"{expense.notes}\n{note_entry}".strip() if expense.notes else note_entry

    db.commit()
    db.refresh(expense)

    log_audit(db, "expense.dispute", member_id=current_user.id, details={"expense_id": expense.id, "reason": clean_reason})

    return expense

@router.post("/{expense_id}/resolve-dispute", response_model=Optional[ExpenseOut])
def resolve_dispute(
    expense_id: int,
    data: ResolveDisputeRequest,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).options(
        joinedload(Expense.category),
        joinedload(Expense.payer),
        joinedload(Expense.splits).joinedload(ExpenseSplit.member)
    ).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    is_admin = getattr(current_user, "is_admin", False)
    if current_user.id != expense.paid_by and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only the expense payer or flat administrator can resolve disputes."
        )

    act = data.action.strip().lower()
    if act in ("cancel", "delete"):
        log_audit(db, "expense.dispute_deleted", member_id=current_user.id, details={"expense_id": expense_id, "resolution": data.resolution_notes})
        db.query(ExpenseSplit).filter(ExpenseSplit.expense_id == expense_id).delete()
        db.delete(expense)
        db.commit()
        return None

    expense.verification_status = "Confirmed"
    expense.resolved_by = current_user.id
    expense.resolution_notes = data.resolution_notes.strip()
    expense.resolved_at = datetime.now()
    db.commit()
    db.refresh(expense)

    log_audit(db, "expense.dispute_confirmed", member_id=current_user.id, details={"expense_id": expense.id, "resolution": data.resolution_notes})

    return expense

@router.post("/upload-receipt")
async def upload_receipt(
    file: UploadFile = File(...),
    current_user: Member = Depends(get_current_user)
):
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Receipt file exceeds maximum 5MB size limit.")

    is_valid = False
    if contents.startswith(b"\xff\xd8\xff"): # JPEG
        is_valid = True
    elif contents.startswith(b"\x89PNG\r\n\x1a\n"): # PNG
        is_valid = True
    elif contents.startswith(b"%PDF-"): # PDF
        is_valid = True
    elif len(contents) >= 12 and contents[:4] == b"RIFF" and contents[8:12] == b"WEBP": # WEBP
        is_valid = True

    if not is_valid:
        raise HTTPException(
            status_code=400, 
            detail="Invalid file content. Must be a valid PNG, JPEG, WEBP, or PDF file."
        )

    uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
    os.makedirs(uploads_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext or ext not in (".png", ".jpg", ".jpeg", ".webp", ".pdf"):
        ext = ".png" if contents.startswith(b"\x89PNG") else (".pdf" if contents.startswith(b"%PDF-") else ".jpg")

    unique_name = f"receipt_{uuid.uuid4().hex[:12]}{ext}"
    file_path = os.path.join(uploads_dir, unique_name)

    with open(file_path, "wb") as f:
        f.write(contents)

    return {"receipt_url": f"/uploads/{unique_name}"}

@router.get("/{expense_id}/receipt")
def get_expense_receipt(
    expense_id: int,
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense or not expense.receipt_url:
        raise HTTPException(status_code=404, detail="No receipt found for this expense.")

    uploads_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))
    fname = os.path.basename(expense.receipt_url)
    target_path = os.path.abspath(os.path.join(uploads_dir, fname))

    # Path traversal guard
    if not target_path.startswith(uploads_dir) or not os.path.isfile(target_path):
        raise HTTPException(status_code=404, detail="Receipt file not found on disk.")

    ext = os.path.splitext(fname)[1].lower()
    media_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(target_path, media_type=media_type)

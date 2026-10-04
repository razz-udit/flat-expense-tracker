import time
import io
import pytest
from decimal import Decimal
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.config import settings
from app.main import app as fastapi_app
from app.models.member import Member
from app.models.category import Category
from app.models.expense import Expense, ExpenseSplit
from app.models.payment import Payment
from app.models.recurring import RecurringExpense
from app.models.audit_log import AuditLog
from app.services.auth_service import create_access_token, hash_password
import app.models

TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

fastapi_app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_database():
    settings.APP_ENV = "test"
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    # Add 6 test flat members: Member 1 is Admin, Member 2-6 are standard members
    for i in range(1, 7):
        db.add(Member(
            name=f"Member {i}",
            email=f"member{i}@flat.internal",
            upi_id=f"member{i}@upi",
            password_hash=hash_password(f"pass{i}123"),
            is_active=True,
            is_admin=(i == 1),
            token_version=1
        ))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(fastapi_app)

def auth_headers(member_id: int, token_version: int = 1) -> dict:
    token = create_access_token(member_id, token_version)
    return {"Authorization": f"Bearer {token}"}

# ==============================================================================
# PHASE 1 — AUTHENTICATED READ APIs & 401 ENFORCEMENT
# ==============================================================================

def test_unauthenticated_read_apis_return_401(client):
    assert client.get("/api/members").status_code == 401
    assert client.get("/api/categories").status_code == 401
    assert client.get("/api/expenses").status_code == 401
    assert client.get("/api/payments").status_code == 401
    assert client.get("/api/recurring").status_code == 401
    assert client.get("/api/balances").status_code == 401
    assert client.get("/api/settlements").status_code == 401
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/monthly-history").status_code == 401

def test_authenticated_read_apis_succeed(client):
    h = auth_headers(1)
    assert client.get("/api/members", headers=h).status_code == 200
    assert client.get("/api/categories", headers=h).status_code == 200
    assert client.get("/api/expenses", headers=h).status_code == 200
    assert client.get("/api/payments", headers=h).status_code == 200
    assert client.get("/api/recurring", headers=h).status_code == 200
    assert client.get("/api/balances", headers=h).status_code == 200
    assert client.get("/api/settlements", headers=h).status_code == 200
    assert client.get("/api/dashboard", headers=h).status_code == 200
    assert client.get("/api/monthly-history", headers=h).status_code == 200

# ==============================================================================
# CORE EXPENSE & BALANCE REGRESSION TESTS
# ==============================================================================

def test_no_predefined_categories_and_dynamic_creation(client):
    h = auth_headers(1)
    res_m = client.get("/api/members", headers=h)
    assert res_m.status_code == 200
    members = res_m.json()
    assert len(members) == 6

    # Verify categories start completely empty
    res_c = client.get("/api/categories", headers=h)
    assert res_c.status_code == 200
    assert len(res_c.json()) == 0

    # Create dynamic category with Member 1's token
    res_create = client.post("/api/categories", json={"name": "Grocery", "description": "Shared provisions"}, headers=h)
    assert res_create.status_code == 201
    assert res_create.json()["name"] == "Grocery"

    # Category list now has 1
    res_c2 = client.get("/api/categories", headers=h)
    assert len(res_c2.json()) == 1

def test_create_equal_split_with_dynamic_category(client):
    h = auth_headers(1)
    members = client.get("/api/members", headers=h).json()

    # Member 1 pays ₹2400 split equally among all 6
    payload = {
        "category_name": "Grocery",
        "amount": 2400.00,
        "paid_by": members[0]["id"],
        "description": "Monthly grocery",
        "expense_date": "2026-09-27",
        "split_type": "equal",
        "member_ids": [m["id"] for m in members]
    }
    res = client.post("/api/expenses", json=payload, headers=h)
    assert res.status_code == 201
    data = res.json()
    assert data["amount"] == "2400.00"
    assert data["category"]["name"] == "Grocery"
    assert len(data["splits"]) == 6
    for s in data["splits"]:
        assert s["amount"] == "400.00"

    # Check balances
    bal_res = client.get("/api/balances", headers=h)
    assert bal_res.status_code == 200
    balances = {b["member_name"]: b for b in bal_res.json()}
    assert balances["Member 1"]["net_balance"] == "2000.00"
    assert balances["Member 1"]["status"] == "Receivable"
    assert balances["Member 2"]["net_balance"] == "-400.00"
    assert balances["Member 2"]["status"] == "Owes"

def test_custom_split_validation(client):
    h = auth_headers(1)
    members = client.get("/api/members", headers=h).json()
    cat_res = client.post("/api/categories", json={"name": "Rent"}, headers=h)
    rent_id = cat_res.json()["id"]

    # Split sum mismatch should fail
    payload_bad = {
        "category_id": rent_id,
        "amount": 1000.00,
        "paid_by": members[0]["id"],
        "description": "Custom rent",
        "expense_date": "2026-09-27",
        "split_type": "custom",
        "splits": [
            {"member_id": members[0]["id"], "amount": 300.00},
            {"member_id": members[1]["id"], "amount": 500.00}
        ]
    }
    res_bad = client.post("/api/expenses", json=payload_bad, headers=h)
    assert res_bad.status_code in (400, 422)

    # Matching split should succeed
    payload_good = {
        "category_id": rent_id,
        "amount": 1000.00,
        "paid_by": members[0]["id"],
        "description": "Custom rent",
        "expense_date": "2026-09-27",
        "split_type": "custom",
        "splits": [
            {"member_id": members[0]["id"], "amount": 400.00},
            {"member_id": members[1]["id"], "amount": 600.00}
        ]
    }
    res_good = client.post("/api/expenses", json=payload_good, headers=h)
    assert res_good.status_code == 201

def test_excluded_member_split(client):
    h = auth_headers(1)
    members = client.get("/api/members", headers=h).json()
    h4 = auth_headers(members[3]["id"])

    # Member 4 pays ₹5000 split among 5 members (Member 6 excluded)
    payload = {
        "category_name": "Extra Equipment",
        "amount": 5000.00,
        "paid_by": members[3]["id"],
        "description": "Water filter",
        "expense_date": "2026-09-27",
        "split_type": "equal",
        "member_ids": [m["id"] for m in members[:5]]
    }
    res = client.post("/api/expenses", json=payload, headers=h4)
    assert res.status_code == 201
    data = res.json()
    assert len(data["splits"]) == 5
    split_member_ids = [s["member_id"] for s in data["splits"]]
    assert members[5]["id"] not in split_member_ids

    # Check Member 6 balance is 0
    bal_res = client.get("/api/balances", headers=h).json()
    m6_bal = [b for b in bal_res if b["member_name"] == "Member 6"][0]
    assert m6_bal["net_balance"] == "0.00"

def test_settlement_and_payment_flow(client):
    h1 = auth_headers(1)
    members = client.get("/api/members", headers=h1).json()
    h2 = auth_headers(members[1]["id"])

    # Member 2 pays ₹1000 split between Member 1 and Member 2 (₹500 each)
    payload = {
        "category_name": "LPG Gas",
        "amount": 1000.00,
        "paid_by": members[1]["id"],
        "description": "LPG cylinder",
        "expense_date": "2026-09-27",
        "split_type": "equal",
        "member_ids": [members[0]["id"], members[1]["id"]]
    }
    res = client.post("/api/expenses", json=payload, headers=h2)
    assert res.status_code == 201

    settle_res = client.get("/api/settlements", headers=h1)
    assert settle_res.status_code == 200
    settlements = settle_res.json()
    assert len(settlements) == 1
    assert settlements[0]["from_member_id"] == members[0]["id"]
    assert settlements[0]["to_member_id"] == members[1]["id"]
    assert settlements[0]["amount"] == "500.00"

    # Record settlement payment
    pay_payload = {
        "from_member": members[0]["id"],
        "to_member": members[1]["id"],
        "amount": 500.00,
        "payment_date": "2026-09-27",
        "status": "Pending",
        "notes": "LPG share"
    }
    pay_res = client.post("/api/payments", json=pay_payload, headers=h1)
    assert pay_res.status_code == 201
    payment_id = pay_res.json()["id"]

    # Receiver (Member 2) verifies settlement
    verify_res = client.post(f"/api/payments/{payment_id}/verify", headers=h2)
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "Paid"

    # Balances must now be 0.00
    bal_res_settled = client.get("/api/balances", headers=h1).json()
    m1_bal = [b for b in bal_res_settled if b["member_name"] == "Member 1"][0]
    m2_bal = [b for b in bal_res_settled if b["member_name"] == "Member 2"][0]
    assert m1_bal["net_balance"] == "0.00"
    assert m2_bal["net_balance"] == "0.00"

# ==============================================================================
# PHASE 2 — SECURE ACCOUNT CLAIMING / SET PASSWORD
# ==============================================================================

def test_direct_set_password_rejected(client):
    # Direct password setting without invite token must be rejected
    res = client.post("/api/auth/set-password", json={"identifier": "Member 2", "new_password": "hackedpass"})
    assert res.status_code == 400
    assert "disabled for security" in res.json()["detail"].lower()

def test_generate_invite_and_claim_account_flow(client):
    h_admin = auth_headers(1)
    # 1. Admin creates a new roommate
    res_create = client.post("/api/members", json={"name": "Rohit Sharma", "upi_id": "rohit@upi"}, headers=h_admin)
    assert res_create.status_code == 201
    rohit_id = res_create.json()["id"]

    # 2. Admin generates invite token
    res_inv = client.post(f"/api/members/{rohit_id}/generate-invite", headers=h_admin)
    assert res_inv.status_code == 200
    inv_data = res_inv.json()
    token = inv_data["claim_token"]
    assert len(token) >= 16

    # 3. New member claims account with token
    res_claim = client.post("/api/auth/claim", json={"token": token, "password": "rohitsecret123"})
    assert res_claim.status_code == 200
    assert res_claim.json()["success"] is True
    assert res_claim.json()["token"] is not None

    # 4. Token cannot be reused (single-use)
    res_reuse = client.post("/api/auth/claim", json={"token": token, "password": "secondattempt"})
    assert res_reuse.status_code == 400

    # 5. Member can now log in normally
    res_login = client.post("/api/auth/login", json={"identifier": "Rohit Sharma", "password": "rohitsecret123"})
    assert res_login.status_code == 200

# ==============================================================================
# AUTH SECURITY, JWT EXPIRATION & SESSION INVALIDATION
# ==============================================================================

def test_mock_token_rejected_in_production(client):
    mock_token = "test_mock_token_testuser@flat.internal|Test User|avatar.png|uid_999"
    
    settings.APP_ENV = "production"
    res_prod = client.post("/api/auth/google", json={"credential": mock_token})
    assert res_prod.status_code == 401
    assert "forbidden outside of test environment" in res_prod.json()["detail"].lower()

    settings.APP_ENV = "test"
    res_test = client.post("/api/auth/google", json={"credential": mock_token, "upi_id": "test@upi"})
    assert res_test.status_code == 200
    assert res_test.json()["success"] is True

def test_jwt_expiration_enforcement(client):
    old_exp = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    try:
        settings.ACCESS_TOKEN_EXPIRE_MINUTES = -10 # Expired 10 minutes ago
        expired_token = create_access_token(1)
    finally:
        settings.ACCESS_TOKEN_EXPIRE_MINUTES = old_exp

    res = client.post("/api/categories", json={"name": "ExpiredTest"}, headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    assert "token has expired" in res.json()["detail"].lower()

def test_jwt_malformed_and_tampered_signature(client):
    valid_token = create_access_token(1)
    parts = valid_token.split(".")
    tampered_token = f"{parts[0]}.{parts[1]}.tampered_signature"
    res_tampered = client.post("/api/categories", json={"name": "TamperTest"}, headers={"Authorization": f"Bearer {tampered_token}"})
    assert res_tampered.status_code == 401

    res_malformed = client.post("/api/categories", json={"name": "Malformed"}, headers={"Authorization": "Bearer not-a-jwt"})
    assert res_malformed.status_code == 401

def test_password_change_invalidates_old_sessions(client):
    m2_id = 2
    old_token = create_access_token(m2_id, token_version=1)
    h_old = {"Authorization": f"Bearer {old_token}"}

    res_ok = client.post("/api/categories", json={"name": "Snacks Before"}, headers=h_old)
    assert res_ok.status_code == 201

    res_change = client.post("/api/auth/change-password", json={
        "member_id": m2_id,
        "current_password": "pass2123",
        "new_password": "newpassword456"
    }, headers=h_old)
    assert res_change.status_code == 200

    # Old token MUST now be rejected
    res_revoked = client.post("/api/categories", json={"name": "Snacks After"}, headers=h_old)
    assert res_revoked.status_code == 401
    assert "session expired" in res_revoked.json()["detail"].lower()

    # Login with new password gives working token
    login_res = client.post("/api/auth/login", json={"identifier": "Member 2", "password": "newpassword456"})
    assert login_res.status_code == 200
    new_token = login_res.json()["token"]

    res_new_ok = client.post("/api/categories", json={"name": "Snacks Valid"}, headers={"Authorization": f"Bearer {new_token}"})
    assert res_new_ok.status_code == 201

# ==============================================================================
# AUTHORIZATION & ADMIN INVARIANTS
# ==============================================================================

def test_admin_role_authorization_and_safety(client):
    h_admin = auth_headers(1)
    h_user = auth_headers(2)

    # Non-admin attempting to add a new member receives 403
    res_deny = client.post("/api/members", json={"name": "Rogue Member"}, headers=h_user)
    assert res_deny.status_code == 403

    # Admin successfully adds member
    res_allow = client.post("/api/members", json={"name": "New Flatmate", "upi_id": "new@upi"}, headers=h_admin)
    assert res_allow.status_code == 201

    # Cannot delete the only active admin
    res_del_admin = client.delete("/api/members/1", headers=h_admin)
    assert res_del_admin.status_code == 400
    assert "only flat admin" in res_del_admin.json()["detail"].lower()

def test_reset_data_endpoint_admin_only(client):
    assert client.post("/api/reset-data").status_code == 401

    res_non_admin = client.post("/api/reset-data", headers=auth_headers(2))
    assert res_non_admin.status_code == 403

    res_admin = client.post("/api/reset-data", headers=auth_headers(1))
    assert res_admin.status_code == 200

# ==============================================================================
# RECEIPT UPLOAD & SERVING SECURITY (MAGIC BYTES)
# ==============================================================================

def test_receipt_upload_magic_bytes_and_serving(client):
    h = auth_headers(1)

    # 1. Invalid file (fake text with .png extension)
    fake_png = io.BytesIO(b"This is not a real image header")
    res_bad = client.post("/api/expenses/upload-receipt", files={"file": ("fake.png", fake_png, "image/png")}, headers=h)
    assert res_bad.status_code == 400
    assert "invalid file content" in res_bad.json()["detail"].lower()

    # 2. Valid PNG header
    valid_png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
    valid_png = io.BytesIO(valid_png_bytes)
    res_good = client.post("/api/expenses/upload-receipt", files={"file": ("receipt.png", valid_png, "image/png")}, headers=h)
    assert res_good.status_code == 200
    receipt_url = res_good.json()["receipt_url"]

    # 3. Create expense with receipt
    exp_res = client.post("/api/expenses", json={
        "category_name": "Internet",
        "amount": 800.00,
        "paid_by": 1,
        "description": "Fibre connection",
        "expense_date": "2026-10-01",
        "receipt_url": receipt_url,
        "split_type": "equal",
        "member_ids": [1, 2]
    }, headers=h)
    assert exp_res.status_code == 201
    exp_id = exp_res.json()["id"]

    # 4. Authenticated receipt serving endpoint
    res_receipt_unauth = client.get(f"/api/expenses/{exp_id}/receipt")
    assert res_receipt_unauth.status_code == 401

    res_receipt_auth = client.get(f"/api/expenses/{exp_id}/receipt", headers=h)
    assert res_receipt_auth.status_code == 200
    assert res_receipt_auth.content.startswith(b"\x89PNG")

# ==============================================================================
# EXPENSE DISPUTE LIFECYCLE
# ==============================================================================

def test_expense_dispute_and_resolution_lifecycle(client):
    h1 = auth_headers(1)
    h2 = auth_headers(2)

    # 1. Create an expense
    exp_res = client.post("/api/expenses", json={
        "category_name": "Snacks",
        "amount": 500.00,
        "paid_by": 1,
        "description": "Party snacks",
        "expense_date": "2026-10-01",
        "split_type": "equal",
        "member_ids": [1, 2]
    }, headers=h1)
    exp_id = exp_res.json()["id"]

    # 2. Member 2 disputes the expense
    disp_res = client.post(f"/api/expenses/{exp_id}/dispute", json={"reason": "I did not attend this party"}, headers=h2)
    assert disp_res.status_code == 200
    assert disp_res.json()["verification_status"] == "Disputed / Flagged"
    assert disp_res.json()["disputed_by"] == 2

    # 3. Payer resolves dispute by confirming
    res_resolve = client.post(f"/api/expenses/{exp_id}/resolve-dispute", json={"action": "confirm", "resolution_notes": "Discussed in flat meeting and verified receipts"}, headers=h1)
    assert res_resolve.status_code == 200
    assert res_resolve.json()["verification_status"] == "Confirmed"
    assert res_resolve.json()["resolved_by"] == 1

# ==============================================================================
# RECURRING EXPENSE FREQUENCY INTERVALS & SPLIT PRESERVATION
# ==============================================================================

def test_recurring_expense_frequencies_and_split_preservation(client):
    h1 = auth_headers(1)
    cat_res = client.post("/api/categories", json={"name": "Apartment Maintenance"}, headers=h1)
    cat_id = cat_res.json()["id"]

    # Recurring with percentage split
    rec_res = client.post("/api/recurring", json={
        "title": "Monthly Maid",
        "category_id": cat_id,
        "amount": 3000.00,
        "paid_by": 1,
        "split_type": "percentage",
        "custom_splits": [
            {"member_id": 1, "percentage": 60.0},
            {"member_id": 2, "percentage": 40.0}
        ],
        "frequency": "Monthly"
    }, headers=h1)
    assert rec_res.status_code == 201
    rec_id = rec_res.json()["id"]

    # Generate expense
    gen_res = client.post(f"/api/recurring/{rec_id}/create-expense", json={"expense_date": "2026-10-01"}, headers=h1)
    assert gen_res.status_code == 200
    splits = {s["member_id"]: s for s in gen_res.json()["splits"]}
    assert Decimal(str(splits[1]["amount"])) == Decimal("1800.00")
    assert Decimal(str(splits[2]["amount"])) == Decimal("1200.00")

    # Second generation in same month is blocked
    gen_dup = client.post(f"/api/recurring/{rec_id}/create-expense", json={"expense_date": "2026-10-15"}, headers=h1)
    assert gen_dup.status_code == 400

# ==============================================================================
# CATEGORY BUDGET ALERTS & ZERO TOLERANCE
# ==============================================================================

def test_category_budget_alert_status(client):
    h1 = auth_headers(1)
    # Total budget = 100 * 6 members = ₹600
    cat_res = client.post("/api/categories", json={"name": "Tea & Coffee", "monthly_budget_per_member": 100.00}, headers=h1)
    cat_id = cat_res.json()["id"]

    # 1. No expense -> normal
    status_res = client.get("/api/categories/budget-status?year=2026&month=10", headers=h1)
    assert status_res.status_code == 200
    item = [c for c in status_res.json() if c["category_id"] == cat_id][0]
    assert item["budget_alert_status"] == "normal"
    assert float(item["percentage_used"]) == 0.0

    # 2. Spend ₹500 (83.3% of 600) -> warning
    client.post("/api/expenses", json={
        "category_id": cat_id,
        "amount": 500.00,
        "paid_by": 1,
        "description": "Coffee beans",
        "expense_date": "2026-10-02",
        "split_type": "equal",
        "member_ids": [1, 2, 3, 4, 5, 6]
    }, headers=h1)

    status_res2 = client.get("/api/categories/budget-status?year=2026&month=10", headers=h1)
    item2 = [c for c in status_res2.json() if c["category_id"] == cat_id][0]
    assert item2["budget_alert_status"] == "warning"

    # 3. Spend additional ₹200 (Total ₹700 > ₹600) -> exceeded
    client.post("/api/expenses", json={
        "category_id": cat_id,
        "amount": 200.00,
        "paid_by": 1,
        "description": "More milk",
        "expense_date": "2026-10-03",
        "split_type": "equal",
        "member_ids": [1, 2, 3, 4, 5, 6]
    }, headers=h1)

    status_res3 = client.get("/api/categories/budget-status?year=2026&month=10", headers=h1)
    item3 = [c for c in status_res3.json() if c["category_id"] == cat_id][0]
    assert item3["budget_alert_status"] == "exceeded"
    assert Decimal(str(item3["exceeded_amount"])) == Decimal("100.00")

# ==============================================================================
# AUDIT LOGS, CSV EXPORT, AND LEAVE PREVIEW
# ==============================================================================

def test_audit_logs_and_csv_export(client):
    h1 = auth_headers(1)

    # Create category and expense to populate audit log and CSV data
    client.post("/api/categories", json={"name": "Groceries Export"}, headers=h1)
    client.post("/api/expenses", json={
        "category_name": "Groceries Export",
        "amount": 120.00,
        "paid_by": 1,
        "description": "Bread and butter",
        "expense_date": "2026-10-05",
        "split_type": "equal",
        "member_ids": [1, 2]
    }, headers=h1)

    # 1. Audit logs endpoint (admin only)
    res_logs = client.get("/api/audit-logs", headers=h1)
    assert res_logs.status_code == 200
    assert len(res_logs.json()) > 0

    # 2. CSV export
    res_csv = client.get("/api/export/expenses/csv", headers=h1)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "Date,Description,Category,Amount" in res_csv.text

    # 3. Leave preview
    res_prev = client.get("/api/members/2/leave-preview", headers=h1)
    assert res_prev.status_code == 200
    assert "can_leave" in res_prev.json()

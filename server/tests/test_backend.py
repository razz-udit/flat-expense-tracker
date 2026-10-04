import time
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
# EXISTING FLOW REGRESSION TESTS WITH AUTHENTICATION
# ==============================================================================

def test_no_predefined_categories_and_dynamic_creation(client):
    res_m = client.get("/api/members")
    assert res_m.status_code == 200
    members = res_m.json()
    assert len(members) == 6

    # Verify categories start completely empty
    res_c = client.get("/api/categories")
    assert res_c.status_code == 200
    assert len(res_c.json()) == 0

    # Create dynamic category with Member 1's token
    headers = auth_headers(members[0]["id"])
    res_create = client.post("/api/categories", json={"name": "Grocery", "description": "Shared provisions"}, headers=headers)
    assert res_create.status_code == 201
    assert res_create.json()["name"] == "Grocery"

    # Category list now has 1
    res_c2 = client.get("/api/categories")
    assert len(res_c2.json()) == 1

def test_create_equal_split_with_dynamic_category(client):
    members = client.get("/api/members").json()
    headers = auth_headers(members[0]["id"])

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
    res = client.post("/api/expenses", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["amount"] == "2400.00"
    assert data["category"]["name"] == "Grocery"
    assert len(data["splits"]) == 6
    for s in data["splits"]:
        assert s["amount"] == "400.00"

    # Check balances
    bal_res = client.get("/api/balances")
    assert bal_res.status_code == 200
    balances = {b["member_name"]: b for b in bal_res.json()}
    assert balances["Member 1"]["net_balance"] == "2000.00"
    assert balances["Member 1"]["status"] == "Receivable"
    assert balances["Member 2"]["net_balance"] == "-400.00"
    assert balances["Member 2"]["status"] == "Owes"

def test_custom_split_validation(client):
    members = client.get("/api/members").json()
    headers = auth_headers(members[0]["id"])
    cat_res = client.post("/api/categories", json={"name": "Rent"}, headers=headers)
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
    res_bad = client.post("/api/expenses", json=payload_bad, headers=headers)
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
    res_good = client.post("/api/expenses", json=payload_good, headers=headers)
    assert res_good.status_code == 201

def test_excluded_member_split(client):
    members = client.get("/api/members").json()
    headers = auth_headers(members[3]["id"])

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
    res = client.post("/api/expenses", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert len(data["splits"]) == 5
    split_member_ids = [s["member_id"] for s in data["splits"]]
    assert members[5]["id"] not in split_member_ids

    # Check Member 6 balance is 0
    bal_res = client.get("/api/balances").json()
    m6_bal = [b for b in bal_res if b["member_name"] == "Member 6"][0]
    assert m6_bal["net_balance"] == "0.00"

def test_settlement_and_payment_flow(client):
    members = client.get("/api/members").json()
    h2 = auth_headers(members[1]["id"])
    h1 = auth_headers(members[0]["id"])

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

    settle_res = client.get("/api/settlements")
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
    bal_res_settled = client.get("/api/balances").json()
    m1_bal = [b for b in bal_res_settled if b["member_name"] == "Member 1"][0]
    m2_bal = [b for b in bal_res_settled if b["member_name"] == "Member 2"][0]
    assert m1_bal["net_balance"] == "0.00"
    assert m2_bal["net_balance"] == "0.00"

# ==============================================================================
# AUDIT PART 1 — CRITICAL AUTHENTICATION SECURITY
# ==============================================================================

def test_mock_token_rejected_in_production(client):
    mock_token = "test_mock_token_testuser@flat.internal|Test User|avatar.png|uid_999"
    
    # 1. Under production, mock tokens MUST be rejected
    settings.APP_ENV = "production"
    res_prod = client.post("/api/auth/google", json={"credential": mock_token})
    assert res_prod.status_code == 401
    assert "forbidden outside of test environment" in res_prod.json()["detail"].lower()

    # 2. Under test environment, mock tokens are allowed
    settings.APP_ENV = "test"
    res_test = client.post("/api/auth/google", json={"credential": mock_token, "upi_id": "test@upi"})
    assert res_test.status_code == 200
    assert res_test.json()["success"] is True

# ==============================================================================
# AUDIT PART 2 — SECURE JWT & EXPIRATION & TOKEN VERSIONING
# ==============================================================================

def test_jwt_expiration_enforcement(client):
    members = client.get("/api/members").json()
    m1_id = members[0]["id"]

    # Issue an expired token
    old_exp = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    try:
        settings.ACCESS_TOKEN_EXPIRE_MINUTES = -10 # Expired 10 minutes ago
        expired_token = create_access_token(m1_id)
    finally:
        settings.ACCESS_TOKEN_EXPIRE_MINUTES = old_exp

    res = client.post("/api/categories", json={"name": "ExpiredTest"}, headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
    assert "token has expired" in res.json()["detail"].lower()

def test_jwt_malformed_and_tampered_signature(client):
    members = client.get("/api/members").json()
    m1_id = members[0]["id"]
    valid_token = create_access_token(m1_id)

    # Tampered signature
    parts = valid_token.split(".")
    tampered_token = f"{parts[0]}.{parts[1]}.tampered_signature"
    res_tampered = client.post("/api/categories", json={"name": "TamperTest"}, headers={"Authorization": f"Bearer {tampered_token}"})
    assert res_tampered.status_code == 401

    # Malformed token
    res_malformed = client.post("/api/categories", json={"name": "Malformed"}, headers={"Authorization": "Bearer not-a-jwt"})
    assert res_malformed.status_code == 401

def test_password_change_invalidates_old_sessions(client):
    members = client.get("/api/members").json()
    m2 = members[1]
    
    # Generate initial token
    old_token = create_access_token(m2["id"], token_version=1)
    h_old = {"Authorization": f"Bearer {old_token}"}

    # Verify old token works
    res_ok = client.post("/api/categories", json={"name": "Snacks Before"}, headers=h_old)
    assert res_ok.status_code == 201

    # Member 2 changes their password
    res_change = client.post("/api/auth/change-password", json={
        "member_id": m2["id"],
        "current_password": "pass2123",
        "new_password": "newpassword456"
    }, headers=h_old)
    assert res_change.status_code == 200

    # Old token MUST now be rejected (token_version incremented)
    res_revoked = client.post("/api/categories", json={"name": "Snacks After"}, headers=h_old)
    assert res_revoked.status_code == 401
    assert "session expired" in res_revoked.json()["detail"].lower()

    # Login with new password gives active token
    login_res = client.post("/api/auth/login", json={"identifier": m2["name"], "password": "newpassword456"})
    assert login_res.status_code == 200
    new_token = login_res.json()["token"]

    # New token works
    res_new_ok = client.post("/api/categories", json={"name": "Snacks Valid"}, headers={"Authorization": f"Bearer {new_token}"})
    assert res_new_ok.status_code == 201

# ==============================================================================
# AUDIT PART 3 & 4 — REAL SERVER-SIDE AUTHORIZATION & ADMIN ROLE
# ==============================================================================

def test_unauthenticated_mutations_rejected(client):
    # Endpoints must strictly reject requests missing valid Bearer token
    assert client.post("/api/categories", json={"name": "AnonCat"}).status_code == 401
    assert client.post("/api/expenses", json={"amount": 100}).status_code == 401
    assert client.post("/api/payments", json={"amount": 100}).status_code == 401
    assert client.post("/api/recurring", json={"title": "AnonRec"}).status_code == 401
    assert client.post("/api/reset-data").status_code == 401

    # Fake X-User-Id header without Bearer token must still be 401
    assert client.post("/api/categories", json={"name": "ForgedHeader"}, headers={"X-User-Id": "1"}).status_code == 401

def test_reset_data_endpoint_admin_only(client):
    members = client.get("/api/members").json()
    admin_id = members[0]["id"]
    non_admin_id = members[1]["id"]

    # 1. Unauthenticated -> 401
    assert client.post("/api/reset-data").status_code == 401

    # 2. Non-admin -> 403 Forbidden
    res_non_admin = client.post("/api/reset-data", headers=auth_headers(non_admin_id))
    assert res_non_admin.status_code == 403
    assert "admin privileges" in res_non_admin.json()["detail"].lower()

    # 3. Admin -> 200 Allowed
    res_admin = client.post("/api/reset-data", headers=auth_headers(admin_id))
    assert res_admin.status_code == 200
    assert "wiped completely" in res_admin.json()["detail"].lower() if "detail" in res_admin.json() else "wiped completely" in res_admin.json()["message"].lower()

def test_admin_role_authorization_and_reorder_safety(client):
    members = client.get("/api/members").json()
    admin_id = members[0]["id"]
    non_admin_id = members[1]["id"]

    # Non-admin attempting to add a new member receives 403
    res_deny = client.post("/api/members", json={"name": "Rogue Member"}, headers=auth_headers(non_admin_id))
    assert res_deny.status_code == 403

    # Admin successfully adds member
    res_allow = client.post("/api/members", json={"name": "New Flatmate", "upi_id": "new@upi"}, headers=auth_headers(admin_id))
    assert res_allow.status_code == 201

# ==============================================================================
# AUDIT PART 5 — GOOGLE OAUTH SECURITY
# ==============================================================================

def test_google_oauth_no_name_matching_and_separate_accounts(client):
    # Two Google users with the same display name "Alex Smith" but different emails and google IDs
    token_alex1 = "test_mock_token_alex1@google.com|Alex Smith|avatar1.png|gid_001"
    token_alex2 = "test_mock_token_alex2@google.com|Alex Smith|avatar2.png|gid_002"

    res1 = client.post("/api/auth/google", json={"credential": token_alex1, "upi_id": "alex1@upi"})
    assert res1.status_code == 200
    m1_data = res1.json()["member"]

    res2 = client.post("/api/auth/google", json={"credential": token_alex2, "upi_id": "alex2@upi"})
    assert res2.status_code == 200
    m2_data = res2.json()["member"]

    # Crucial: Must be two distinct accounts, not conflated by display name!
    assert m1_data["id"] != m2_data["id"]
    assert m1_data["email"] == "alex1@google.com"
    assert m2_data["email"] == "alex2@google.com"

# ==============================================================================
# AUDIT PART 6 — PASSWORD SECURITY & NO SILENT ASSIGNMENT
# ==============================================================================

def test_no_silent_password_assignment_on_login(client):
    # Pre-added member with no password hash
    admin = client.get("/api/members").json()[0]
    new_m = client.post("/api/members", json={"name": "Uninitialized Roommate", "upi_id": "uninit@upi"}, headers=auth_headers(admin["id"])).json()

    # Attempting to login directly without prior password creation MUST be rejected
    res_login = client.post("/api/auth/login", json={"identifier": new_m["name"], "password": "randompassword123"})
    assert res_login.status_code == 400
    assert "password has not been created" in res_login.json()["detail"].lower()

def test_signup_requires_explicit_password(client):
    # Signup without password fails validation (422)
    res_bad = client.post("/api/auth/signup", json={"name": "New User", "upi_id": "user@upi"})
    assert res_bad.status_code == 422

# ==============================================================================
# AUDIT PART 7 — SPLIT & EXPENSE INTEGRITY (SHARES & PERCENTAGE PERSISTENCE)
# ==============================================================================

def test_shares_and_percentage_persistence(client):
    members = client.get("/api/members").json()
    m1 = members[0]
    m2 = members[1]
    h1 = auth_headers(m1["id"])

    # 1. Shares split
    sh_payload = {
        "category_name": "Groceries",
        "amount": 300.00,
        "paid_by": m1["id"],
        "description": "Vegetables",
        "expense_date": "2026-10-04",
        "split_type": "shares",
        "splits": [
            {"member_id": m1["id"], "shares": 2.0},
            {"member_id": m2["id"], "shares": 1.0}
        ]
    }
    res_sh = client.post("/api/expenses", json=sh_payload, headers=h1)
    assert res_sh.status_code == 201
    sh_exp = res_sh.json()
    exp_id = sh_exp["id"]

    # Verify shares are stored and returned in ExpenseSplitOut
    res_get = client.get(f"/api/expenses/{exp_id}")
    assert res_get.status_code == 200
    splits = {s["member_id"]: s for s in res_get.json()["splits"]}
    assert Decimal(str(splits[m1["id"]]["shares"])) == Decimal("2.00")
    assert Decimal(str(splits[m2["id"]]["shares"])) == Decimal("1.00")
    assert Decimal(str(splits[m1["id"]]["amount"])) == Decimal("200.00")
    assert Decimal(str(splits[m2["id"]]["amount"])) == Decimal("100.00")

# ==============================================================================
# AUDIT PART 8 — NULL/OPTIONAL UPDATES (MODEL_FIELDS_SET)
# ==============================================================================

def test_null_field_updates_billing_period_and_budget(client):
    members = client.get("/api/members").json()
    h1 = auth_headers(members[0]["id"])

    # 1. Clear billing period on expense
    exp_res = client.post("/api/expenses", json={
        "category_name": "WiFi",
        "amount": 500.00,
        "paid_by": members[0]["id"],
        "description": "WiFi monthly",
        "expense_date": "2026-10-01",
        "billing_period_start": "2026-10-01",
        "billing_period_end": "2026-10-31",
        "split_type": "equal",
        "member_ids": [members[0]["id"], members[1]["id"]]
    }, headers=h1)
    exp_id = exp_res.json()["id"]
    assert exp_res.json()["billing_period_start"] == "2026-10-01"

    # Explicitly clear billing_period_start
    update_res = client.put(f"/api/expenses/{exp_id}", json={"billing_period_start": None}, headers=h1)
    assert update_res.status_code == 200
    assert update_res.json()["billing_period_start"] is None

    # 2. Clear category monthly budget
    cat_res = client.post("/api/categories", json={
        "name": "Housekeeping",
        "monthly_budget_per_member": 500.00
    }, headers=h1)
    cat_id = cat_res.json()["id"]
    assert cat_res.json()["monthly_budget_per_member"] == "500.00"

    cat_update = client.put(f"/api/categories/{cat_id}", json={"monthly_budget_per_member": None}, headers=h1)
    assert cat_update.status_code == 200
    assert cat_update.json()["monthly_budget_per_member"] is None

# ==============================================================================
# AUDIT PART 9 — RECURRING EXPENSES IDEMPOTENCY
# ==============================================================================

def test_recurring_expense_idempotency(client):
    members = client.get("/api/members").json()
    h1 = auth_headers(members[0]["id"])

    cat_res = client.post("/api/categories", json={"name": "Utilities"}, headers=h1)
    cat_id = cat_res.json()["id"]

    rec_res = client.post("/api/recurring", json={
        "title": "Water Dispenser",
        "category_id": cat_id,
        "amount": 600.00,
        "paid_by": members[0]["id"],
        "split_type": "equal",
        "frequency": "Monthly"
    }, headers=h1)
    assert rec_res.status_code == 201
    rec_id = rec_res.json()["id"]

    # Generate expense for October 2026
    gen1 = client.post(f"/api/recurring/{rec_id}/create-expense", json={"expense_date": "2026-10-05"}, headers=h1)
    assert gen1.status_code == 200
    assert gen1.json()["amount"] == "600.00"

    # Attempting to generate again for the same period MUST fail with 400
    gen2 = client.post(f"/api/recurring/{rec_id}/create-expense", json={"expense_date": "2026-10-15"}, headers=h1)
    assert gen2.status_code == 400
    assert "already been generated" in gen2.json()["detail"].lower()

# ==============================================================================
# AUDIT PART 10 — PAYMENT SETTLEMENT RULES
# ==============================================================================

def test_payment_rules_no_self_payment(client):
    members = client.get("/api/members").json()
    h1 = auth_headers(members[0]["id"])

    # Cannot pay self
    res_self = client.post("/api/payments", json={
        "from_member": members[0]["id"],
        "to_member": members[0]["id"],
        "amount": 200.00,
        "payment_date": "2026-10-05"
    }, headers=h1)
    assert res_self.status_code in (400, 422)

    # Cannot pay <= 0
    res_zero = client.post("/api/payments", json={
        "from_member": members[0]["id"],
        "to_member": members[1]["id"],
        "amount": 0.00,
        "payment_date": "2026-10-05"
    }, headers=h1)
    assert res_zero.status_code in (400, 422)

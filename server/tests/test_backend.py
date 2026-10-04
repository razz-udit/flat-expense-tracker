import pytest
from decimal import Decimal
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app as fastapi_app
from app.models.member import Member
from app.models.category import Category
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
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    # Add 6 test flat members
    for i in range(1, 7):
        db.add(Member(name=f"Member {i}", upi_id=f"member{i}@upi", is_active=True))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(fastapi_app)

def test_no_predefined_categories_and_dynamic_creation(client):
    res_m = client.get("/api/members")
    assert res_m.status_code == 200
    members = res_m.json()
    assert len(members) == 6

    # Verify categories start completely empty (no predefined categories)
    res_c = client.get("/api/categories")
    assert res_c.status_code == 200
    categories = res_c.json()
    assert len(categories) == 0

    # Create dynamic category
    res_create = client.post("/api/categories", json={"name": "Grocery", "description": "Shared provisions"})
    assert res_create.status_code == 201
    assert res_create.json()["name"] == "Grocery"

    # Category list now has 1
    res_c2 = client.get("/api/categories")
    assert len(res_c2.json()) == 1

def test_create_equal_split_with_dynamic_category(client):
    members = client.get("/api/members").json()
    
    # Member 1 pays ₹2400 split equally among all 6, passing category_name dynamically
    payload = {
        "category_name": "Grocery",
        "amount": 2400.00,
        "paid_by": members[0]["id"],
        "description": "Monthly grocery",
        "expense_date": "2026-09-27",
        "split_type": "equal",
        "member_ids": [m["id"] for m in members]
    }
    res = client.post("/api/expenses", json=payload)
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
    # Create category first
    cat_res = client.post("/api/categories", json={"name": "Rent"})
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
    res_bad = client.post("/api/expenses", json=payload_bad)
    assert res_bad.status_code == 422 or res_bad.status_code == 400

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
    res_good = client.post("/api/expenses", json=payload_good)
    assert res_good.status_code == 201

def test_excluded_member_split(client):
    members = client.get("/api/members").json()

    # Member 6 excluded, split among 5 members
    payload = {
        "category_name": "Extra Equipment",
        "amount": 5000.00,
        "paid_by": members[3]["id"], # Member 4
        "description": "Water filter",
        "expense_date": "2026-09-27",
        "split_type": "equal",
        "member_ids": [m["id"] for m in members[:5]]
    }
    res = client.post("/api/expenses", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert len(data["splits"]) == 5
    split_member_ids = [s["member_id"] for s in data["splits"]]
    assert members[5]["id"] not in split_member_ids

    # Check that Member 6 balance is 0
    bal_res = client.get("/api/balances").json()
    m6_bal = [b for b in bal_res if b["member_name"] == "Member 6"][0]
    assert m6_bal["net_balance"] == "0.00"

def test_settlement_and_payment_flow(client):
    members = client.get("/api/members").json()

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
    client.post("/api/expenses", json=payload)

    # Check suggested settlements
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
    pay_res = client.post("/api/payments", json=pay_payload)
    assert pay_res.status_code == 201
    payment_id = pay_res.json()["id"]

    # Mark as Paid
    update_res = client.put(f"/api/payments/{payment_id}", json={"status": "Paid"})
    assert update_res.status_code == 200

    # Balances must now be fully settled (0.00)
    bal_res_settled = client.get("/api/balances").json()
    m1_bal_after = [b for b in bal_res_settled if b["member_name"] == "Member 1"][0]
    m2_bal_after = [b for b in bal_res_settled if b["member_name"] == "Member 2"][0]
    assert m1_bal_after["net_balance"] == "0.00"
    assert m2_bal_after["net_balance"] == "0.00"

    # Suggested settlements should now be empty
    settle_res_after = client.get("/api/settlements").json()
    assert len(settle_res_after) == 0

def test_monthly_history_and_billing_period(client):
    members = client.get("/api/members").json()

    # Multi-month electricity expense
    payload = {
        "category_name": "Electricity",
        "amount": 7800.00,
        "paid_by": members[2]["id"],
        "description": "Electricity bill",
        "expense_date": "2026-09-27",
        "billing_period_start": "2026-09-01",
        "billing_period_end": "2026-11-30",
        "split_type": "equal",
        "member_ids": [m["id"] for m in members]
    }
    client.post("/api/expenses", json=payload)

    hist_res = client.get("/api/monthly-history")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert len(history) >= 1
    assert history[0]["year"] == 2026
    assert history[0]["month"] == 9
    assert history[0]["total_amount"] == "7800.00"

    detail_res = client.get("/api/monthly-summary/2026/9")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["total_amount"] == "7800.00"
    assert len(detail["categories"]) == 1
    assert detail["categories"][0]["category_name"] == "Electricity"

def test_expense_authorization_and_ownership(client):
    members = client.get("/api/members").json()
    admin_user = members[0] # Member 1 is flat admin
    payer_user = members[1] # Member 2 is payer
    other_user = members[2] # Member 3 is unrelated roommate

    # 1. Member 2 creates an expense
    create_payload = {
        "category_name": "Grocery",
        "amount": 900.00,
        "paid_by": payer_user["id"],
        "description": "Vegetables and fruits",
        "expense_date": "2026-09-28",
        "split_type": "equal",
        "member_ids": [members[0]["id"], members[1]["id"], members[2]["id"]]
    }
    create_res = client.post("/api/expenses", json=create_payload)
    assert create_res.status_code == 201
    expense_id = create_res.json()["id"]

    # 2. Anonymous request without user ID should be rejected with 401
    anon_update = client.put(f"/api/expenses/{expense_id}", json={"description": "Hacked description"})
    assert anon_update.status_code == 401

    anon_delete = client.delete(f"/api/expenses/{expense_id}")
    assert anon_delete.status_code == 401

    # 3. Unrelated roommate (Member 3) attempting to edit Member 2's expense should fail with 403 Forbidden
    unauth_update = client.put(
        f"/api/expenses/{expense_id}?user_id={other_user['id']}",
        json={"description": "Member 3 modified this"}
    )
    assert unauth_update.status_code == 403
    assert "Permission denied" in unauth_update.json()["detail"]

    # 4. Unrelated roommate attempting to delete Member 2's expense should fail with 403 Forbidden
    unauth_delete = client.delete(
        f"/api/expenses/{expense_id}?user_id={other_user['id']}"
    )
    assert unauth_delete.status_code == 403
    assert "Permission denied" in unauth_delete.json()["detail"]

    # 5. Payer (Member 2) editing their own expense should succeed
    payer_update = client.put(
        f"/api/expenses/{expense_id}?user_id={payer_user['id']}",
        json={"description": "Vegetables, fruits and milk"}
    )
    assert payer_update.status_code == 200
    assert payer_update.json()["description"] == "Vegetables, fruits and milk"

    # 6. No other member (even Member 1) can edit Member 2's expense (fails with 403 Forbidden)
    other_member_update = client.put(
        f"/api/expenses/{expense_id}?user_id={admin_user['id']}",
        json={"notes": "Member 1 attempting to edit"}
    )
    assert other_member_update.status_code == 403
    assert "Permission denied" in other_member_update.json()["detail"]

    # 7. Bearer token authentication works for payer
    from app.services.auth_service import create_access_token
    payer_token = create_access_token(payer_user["id"])
    token_update = client.put(
        f"/api/expenses/{expense_id}",
        headers={"Authorization": f"Bearer {payer_token}"},
        json={"description": "Vegetables, fruits and almond milk"}
    )
    assert token_update.status_code == 200
    assert token_update.json()["description"] == "Vegetables, fruits and almond milk"

    # 8. Attempting to reassign payer should fail with 403
    reassign_attempt = client.put(
        f"/api/expenses/{expense_id}?user_id={payer_user['id']}",
        json={"paid_by": other_user["id"]}
    )
    assert reassign_attempt.status_code == 403
    assert "cannot change the payer" in reassign_attempt.json()["detail"].lower()

    # 9. Other member attempting to delete Member 2's expense must fail
    other_delete = client.delete(
        f"/api/expenses/{expense_id}?user_id={admin_user['id']}"
    )
    assert other_delete.status_code == 403
    assert "Permission denied" in other_delete.json()["detail"]

    # 10. Payer (Member 2) deleting their own expense should succeed
    payer_delete = client.delete(
        f"/api/expenses/{expense_id}",
        headers={"Authorization": f"Bearer {payer_token}"}
    )
    assert payer_delete.status_code == 200
    assert payer_delete.json()["message"] == "Expense deleted successfully"


def test_google_auth_flow(client):
    # 1. Reject when no token is provided
    res_empty = client.post("/api/auth/google", json={})
    assert res_empty.status_code == 400
    assert "token was provided" in res_empty.json()["detail"].lower()

    # 2. Reject when invalid/fake token is sent (Google tokeninfo returns 400/401)
    res_fake = client.post("/api/auth/google", json={"credential": "invalid_fake_token_12345"})
    assert res_fake.status_code == 401
    assert "rejected by google api" in res_fake.json()["detail"].lower() or "google verification error" in res_fake.json()["detail"].lower()

    # 3. Existing member logs in with verified Google token (matching Member 1)
    token1 = "test_mock_token_member1@flat.internal|Member 1|https://lh3.googleusercontent.com/avatar1.png|google_uid_001"
    res1 = client.post("/api/auth/google", json={"credential": token1})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["success"] is True
    assert data1["member"]["name"] == "Member 1"
    assert data1["token"] is not None

    # Verify google_id and avatar were linked
    members = client.get("/api/members").json()
    m1 = next(m for m in members if m["name"] == "Member 1")
    assert m1["avatar_url"] == "https://lh3.googleusercontent.com/avatar1.png"

    # 4. New roommate logs in with Google token but provides no UPI ID -> 400 NEEDS_UPI_ID
    new_token = "test_mock_token_newroommate@flat.internal|New Roommate|https://lh3.googleusercontent.com/avatar_new.png|google_uid_999"
    res_no_upi = client.post("/api/auth/google", json={"credential": new_token})
    assert res_no_upi.status_code == 400
    assert "NEEDS_UPI_ID" in res_no_upi.json()["detail"]

    # 5. New roommate provides invalid UPI ID -> 400 NEEDS_UPI_ID
    res_bad_upi = client.post("/api/auth/google", json={
        "credential": new_token,
        "upi_id": "invalid_upi_no_at_symbol"
    })
    assert res_bad_upi.status_code == 400
    assert "NEEDS_UPI_ID" in res_bad_upi.json()["detail"]

    # 6. New roommate provides valid UPI ID -> 200 Created & logged in
    res_new = client.post("/api/auth/google", json={
        "credential": new_token,
        "upi_id": "newroommate@okhdfcbank"
    })
    assert res_new.status_code == 200
    data_new = res_new.json()
    assert data_new["success"] is True
    assert data_new["member"]["name"] == "New Roommate"
    assert data_new["member"]["upi_id"] == "newroommate@okhdfcbank"
    assert data_new["token"] is not None


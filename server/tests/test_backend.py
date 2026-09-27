import pytest
from decimal import Decimal
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app as fastapi_app
from app.services.seed_service import seed_initial_data
from sqlalchemy.pool import StaticPool
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
    seed_initial_data(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(fastapi_app)

def test_initial_seed_members_and_categories(client):
    res_m = client.get("/api/members")
    assert res_m.status_code == 200
    members = res_m.json()
    assert len(members) == 6
    assert members[0]["name"] == "Member 1"
    assert members[5]["name"] == "Member 6"

    res_c = client.get("/api/categories")
    assert res_c.status_code == 200
    categories = res_c.json()
    assert len(categories) == 11
    cat_names = [c["name"] for c in categories]
    assert "Rent" in cat_names
    assert "Electricity" in cat_names
    assert "Grocery" in cat_names
    assert "Other" in cat_names

def test_create_equal_split_expense(client):
    members = client.get("/api/members").json()
    categories = client.get("/api/categories").json()
    grocery_id = [c["id"] for c in categories if c["name"] == "Grocery"][0]
    
    # Member 1 pays ₹2400 split equally among all 6
    payload = {
        "category_id": grocery_id,
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
    assert len(data["splits"]) == 6
    # Each split should be 400.00
    for s in data["splits"]:
        assert s["amount"] == "400.00"

    # Check balances
    bal_res = client.get("/api/balances")
    assert bal_res.status_code == 200
    balances = {b["member_name"]: b for b in bal_res.json()}
    # Member 1 paid 2400, owes 400 => net balance = +2000
    assert balances["Member 1"]["net_balance"] == "2000.00"
    assert balances["Member 1"]["status"] == "Receivable"
    # Member 2 paid 0, owes 400 => net balance = -400
    assert balances["Member 2"]["net_balance"] == "-400.00"
    assert balances["Member 2"]["status"] == "Owes"

def test_custom_split_validation(client):
    members = client.get("/api/members").json()
    categories = client.get("/api/categories").json()
    rent_id = [c["id"] for c in categories if c["name"] == "Rent"][0]

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
            {"member_id": members[1]["id"], "amount": 600.00} # Sum is 900 != 1000
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
    categories = client.get("/api/categories").json()
    eq_id = [c["id"] for c in categories if c["name"] == "Extra Equipment"][0]

    # Member 6 excluded, split among 5 members
    payload = {
        "category_id": eq_id,
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
    categories = client.get("/api/categories").json()
    lpg_id = [c["id"] for c in categories if c["name"] == "LPG Gas"][0]

    # Member 2 pays ₹1000 split between Member 1 and Member 2 (₹500 each)
    payload = {
        "category_id": lpg_id,
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
    assert settlements[0]["from_member_id"] == members[0]["id"] # Member 1 owes
    assert settlements[0]["to_member_id"] == members[1]["id"] # Member 2 should receive
    assert settlements[0]["amount"] == "500.00"
    assert settlements[0]["upi_link"] is not None

    # Record a settlement payment from Member 1 to Member 2
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

    # Still pending, so net balances are not settled yet
    bal_res_pending = client.get("/api/balances").json()
    m1_bal = [b for b in bal_res_pending if b["member_name"] == "Member 1"][0]
    assert m1_bal["net_balance"] == "-500.00"

    # Now mark payment as Paid
    update_res = client.put(f"/api/payments/{payment_id}", json={"status": "Paid"})
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "Paid"

    # Balances must now be fully settled (0.00)!
    bal_res_settled = client.get("/api/balances").json()
    m1_bal_after = [b for b in bal_res_settled if b["member_name"] == "Member 1"][0]
    m2_bal_after = [b for b in bal_res_settled if b["member_name"] == "Member 2"][0]
    assert m1_bal_after["net_balance"] == "0.00"
    assert m2_bal_after["net_balance"] == "0.00"

    # Suggested settlements should now be empty!
    settle_res_after = client.get("/api/settlements").json()
    assert len(settle_res_after) == 0

def test_monthly_history_and_billing_period(client):
    members = client.get("/api/members").json()
    categories = client.get("/api/categories").json()
    elec_id = [c["id"] for c in categories if c["name"] == "Electricity"][0]

    # Multi-month electricity expense
    payload = {
        "category_id": elec_id,
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

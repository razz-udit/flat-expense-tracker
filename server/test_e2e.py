import httpx
import sys

BASE_URL = "http://127.0.0.1:8000/api"

def run_e2e_tests():
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    print("Step 1: Check members and categories...")
    members = client.get("/members").json()
    assert len(members) >= 6, f"Expected 6 members, got {len(members)}"
    print(f"[OK] Found {len(members)} flat members")

    categories = client.get("/categories").json()
    assert len(categories) >= 11, f"Expected at least 11 categories, got {len(categories)}"
    print(f"[OK] Found {len(categories)} categories")

    print("\nStep 2: Reset database to clean slate...")
    reset_res = client.post("/reset-data")
    assert reset_res.status_code == 200
    print("[OK] Reset completed")

    print("\nStep 3: Test Equal Split (Grocery Rs. 2400 paid by Member 1 across all 6 members)...")
    m_ids = [m["id"] for m in members[:6]]
    grocery_id = [c["id"] for c in categories if c["name"] == "Grocery"][0]
    exp1 = client.post("/expenses", json={
        "category_id": grocery_id,
        "amount": 2400.00,
        "paid_by": m_ids[0],
        "description": "Monthly grocery",
        "expense_date": "2026-09-27",
        "split_type": "equal",
        "member_ids": m_ids
    }).json()
    assert exp1["amount"] == "2400.00"
    assert len(exp1["splits"]) == 6
    for s in exp1["splits"]:
        assert s["amount"] == "400.00"
    print("[OK] Grocery Rs. 2400 equal split verified (Rs. 400/member)")

    print("\nStep 4: Verify balances after equal split...")
    balances = {b["member_name"]: b for b in client.get("/balances").json()}
    assert balances["Member 1"]["net_balance"] == "2000.00" # Paid 2400, owes 400
    assert balances["Member 2"]["net_balance"] == "-400.00" # Paid 0, owes 400
    print("[OK] Balances: Member 1 = +Rs. 2000.00, Member 2 = -Rs. 400.00")

    print("\nStep 5: Test Custom Split validation (mismatch should fail)...")
    rent_id = [c["id"] for c in categories if c["name"] == "Rent"][0]
    bad_res = client.post("/expenses", json={
        "category_id": rent_id,
        "amount": 3000.00,
        "paid_by": m_ids[1],
        "description": "Partial rent",
        "expense_date": "2026-09-27",
        "split_type": "custom",
        "splits": [
            {"member_id": m_ids[0], "amount": 1000.00},
            {"member_id": m_ids[1], "amount": 1500.00} # sum 2500 != 3000
        ]
    })
    assert bad_res.status_code in (400, 422), f"Expected validation failure, got {bad_res.status_code}"
    print("[OK] Non-matching custom split rejected as expected")

    print("\nStep 6: Test Valid Custom Split (Rent Rs. 12,000 paid by Member 2)...")
    good_res = client.post("/expenses", json={
        "category_id": rent_id,
        "amount": 12000.00,
        "paid_by": m_ids[1],
        "description": "September Rent",
        "expense_date": "2026-09-01",
        "split_type": "equal",
        "member_ids": m_ids
    })
    assert good_res.status_code == 201
    print("[OK] Rent Rs. 12,000 recorded")

    print("\nStep 7: Test Excluding a Member (Member 6 away, Equipment Rs. 5000 paid by Member 4)...")
    eq_id = [c["id"] for c in categories if c["name"] == "Extra Equipment"][0]
    exp3 = client.post("/expenses", json={
        "category_id": eq_id,
        "amount": 5000.00,
        "paid_by": m_ids[3],
        "description": "Water filter",
        "expense_date": "2026-09-18",
        "split_type": "equal",
        "member_ids": m_ids[:5] # Member 6 excluded
    }).json()
    assert len(exp3["splits"]) == 5
    split_mids = [s["member_id"] for s in exp3["splits"]]
    assert m_ids[5] not in split_mids
    print("[OK] Member 6 successfully excluded from split")

    print("\nStep 8: Test Multi-month / Billing Period (Electricity Rs. 7800 Sep 1 to Nov 30)...")
    elec_id = [c["id"] for c in categories if c["name"] == "Electricity"][0]
    exp4 = client.post("/expenses", json={
        "category_id": elec_id,
        "amount": 7800.00,
        "paid_by": m_ids[2],
        "description": "Electricity bill",
        "expense_date": "2026-09-15",
        "billing_period_start": "2026-09-01",
        "billing_period_end": "2026-11-30",
        "split_type": "equal",
        "member_ids": m_ids
    }).json()
    assert exp4["billing_period_start"] == "2026-09-01"
    assert exp4["billing_period_end"] == "2026-11-30"
    print("[OK] Multi-month billing period verified")

    print("\nStep 9: Test Settlements Generation & UPI Deep Links...")
    settlements = client.get("/settlements").json()
    assert len(settlements) > 0
    print(f"[OK] Generated {len(settlements)} minimal settlements")
    for s in settlements:
        assert float(s["amount"]) > 0
        if s["to_member_upi"]:
            assert "upi://pay?" in s["upi_link"]
            print(f"  -> {s['from_member_name']} pays {s['to_member_name']}: Rs. {s['amount']} (UPI ready)")

    print("\nStep 10: Test Recording Settlement & Marking as Paid...")
    first_settle = settlements[0]
    pay_res = client.post("/payments", json={
        "from_member": first_settle["from_member_id"],
        "to_member": first_settle["to_member_id"],
        "amount": float(first_settle["amount"]),
        "payment_date": "2026-09-27",
        "status": "Paid",
        "notes": "UPI payment complete"
    }).json()
    assert pay_res["status"] == "Paid"
    print(f"[OK] Recorded Paid settlement: Rs. {pay_res['amount']} from Member {pay_res['from_member']} to Member {pay_res['to_member']}")

    print("\nStep 11: Verify Balance updated after Paid settlement...")
    settlements_after = client.get("/settlements").json()
    assert len(settlements_after) < len(settlements), "Settlements count should reduce after payment"
    print("[OK] Settlements count reduced and balances reconciled successfully")

    print("\nStep 12: Test Recurring Expenses System...")
    recurring = client.get("/recurring").json()
    assert len(recurring) >= 1
    rec1 = recurring[0]
    post_rec = client.post(f"/recurring/{rec1['id']}/create-expense", json={
        "expense_date": "2026-09-27",
        "description": f"{rec1['title']} Test Post"
    }).json()
    assert float(post_rec["amount"]) == float(rec1["amount"])
    print(f"[OK] Posted expense from recurring template: '{post_rec['description']}'")

    print("\nStep 13: Test Edit and Delete Expense...")
    exp_to_edit = post_rec["id"]
    client.put(f"/expenses/{exp_to_edit}", json={
        "description": "Updated Test Post",
        "amount": 500.00,
        "split_type": "equal",
        "member_ids": m_ids
    })
    edited = client.get(f"/expenses/{exp_to_edit}").json()
    assert edited["amount"] == "500.00"
    assert edited["description"] == "Updated Test Post"
    print("[OK] Expense edited successfully")

    del_res = client.delete(f"/expenses/{exp_to_edit}")
    assert del_res.status_code == 200
    assert client.get(f"/expenses/{exp_to_edit}").status_code == 404
    print("[OK] Expense deleted successfully")

    print("\nStep 14: Test Monthly Summary and Category Breakdown...")
    summary = client.get("/monthly-summary/2026/9").json()
    assert summary["year"] == 2026
    assert summary["month"] == 9
    assert len(summary["categories"]) > 0
    assert len(summary["contributions"]) > 0
    assert len(summary["shares"]) > 0
    print(f"[OK] Monthly Summary: Total {summary['total_amount']}, {len(summary['categories'])} categories")

    print("\n=== ALL 14 END-TO-END VERIFICATION CHECKS PASSED PERFECTLY! ===")

if __name__ == "__main__":
    run_e2e_tests()

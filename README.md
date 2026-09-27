# FlatMatePay - Personal Flat Expense & Payment Manager

A personal flat expense and settlement manager built for a flat shared by exactly 6 members. It tracks collective household expenses, calculates each member's share (supporting both equal and custom splits), minimizes peer-to-peer debts, generates UPI deep links / QR codes, records payments, and maintains complete monthly expense history.

---

## 🚀 Technology Stack

### Frontend
- **Framework**: React 19 + Vite 8
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v7 (`react-router-dom`)
- **Icons**: Lucide React
- **API Communication**: Native Fetch with Vite reverse-proxy to FastAPI

### Backend
- **Framework**: FastAPI (Python 3.12 / 3.14)
- **Database ORM**: SQLAlchemy 2.0 (configured with SQLite, modular for PostgreSQL)
- **Validation**: Pydantic v2 & Pydantic-Settings
- **Server**: Uvicorn ASGI
- **Precision**: Monetary calculations with `Decimal` and zero float drift
- **Tests**: Pytest + HTTPX test client

---

## 📁 Folder Structure

```text
payment_tracker/
├── client/                     # Frontend React + Vite
│   ├── src/
│   │   ├── components/         # Navbar, AddExpenseModal, UpiPayModal, ToastContainer
│   │   ├── context/            # AppContext (active viewer, state, toasts)
│   │   ├── pages/              # Dashboard, Expenses, Settlements, MonthlyHistory, Recurring, Settings
│   │   ├── services/           # api.js client
│   │   ├── App.jsx             # Routes and layout
│   │   ├── main.jsx            # Entry point
│   │   └── index.css           # Tailwind base styles
│   ├── package.json
│   └── vite.config.js          # Vite config with Tailwind & /api proxy
├── server/                     # Backend FastAPI + SQLite
│   ├── app/
│   │   ├── models/             # Member, Category, Expense, ExpenseSplit, Payment, RecurringExpense
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── routers/            # members, categories, expenses, payments, recurring, dashboard
│   │   ├── services/           # balance_service, settlement_service, upi_service, seed_service
│   │   ├── config.py           # App configuration
│   │   ├── database.py         # SQLAlchemy engine & session dependency
│   │   └── main.py             # FastAPI entry point & CORS
│   ├── tests/                  # Pytest automated test suite
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example
│   └── test_e2e.py             # End-to-end verification script
└── README.md
```

---

## ⚡ Quick Start / How to Run

### 1. Backend Setup & Run

Open a terminal in `server/`:

```powershell
cd server

# Create virtual environment (using python or uv)
python -m venv .venv

# Activate virtual environment:
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend starts at `http://127.0.0.1:8000`.
- Interactive Swagger API docs: `http://127.0.0.1:8000/docs`
- Alternative ReDoc documentation: `http://127.0.0.1:8000/redoc`

*Note: On first startup, the database `flat_expenses.db` is automatically created and seeded with 6 default members ("Member 1" through "Member 6") and 11 default categories.*

---

### 2. Frontend Setup & Run

Open a second terminal in `client/`:

```powershell
cd client

# Install dependencies (if not already installed)
npm install

# Start development server
npm run dev
```

The frontend will run at `http://localhost:5173`.
Vite is preconfigured to proxy `/api` requests to `http://127.0.0.1:8000`, so no CORS configuration is required during local development.

---

## 🧪 Testing

### Automated Backend Pytest Suite
Run from the `server/` directory:
```powershell
.venv\Scripts\python -m pytest
```

### Full End-to-End Verification Test
Run from the `server/` directory with the backend running:
```powershell
.venv\Scripts\python test_e2e.py
```
This tests all 14 core requirements:
1. Member & Category seeding
2. Equal splitting
3. Custom splitting & validation
4. Excluding away members from splits
5. Multi-month / billing periods (e.g. Electricity Sep-Nov)
6. Debt minimization & settlement calculation
7. UPI deep link generation
8. Recording settlements and balance reconciliation
9. Recurring expenses workflow
10. Expense editing & balance recalculation
11. Expense deletion & balance recalculation
12. Monthly history archive and category analytics

---

## 🔑 Key Features & Usage

### 1. Dynamic Flat Size & Member Configuration
You are **not locked into 6 members**. You can configure your flat to any number of people (2 to 20):
- Go to **Settings** -> **Flat Members** -> Click **Change Flat Size**.
- Use the stepper to choose your flat size (e.g. 2, 3, 4, 5, 6, 8, etc.).
- Customize each flatmate's name and UPI ID in one screen.
- Click **Apply Flat Size** — all split calculators, dashboard averages, and settlement algorithms automatically adapt immediately.

### 2. Viewing Perspectives ("Viewing as Member X")
In the top navigation bar, select any member from the **Viewing as** dropdown (or "Flat All Members").
- When a member is selected, the dashboard dynamically shows **their personal share**, **what they paid out of pocket**, and **their net balance** (+₹X receivable or -₹Y owed).
- Provides direct 1-click action buttons: **Pay via UPI** to flatmates they owe, or **Mark as Received** from flatmates who owe them.

### 3. Collective Expenses & Flexible Splitting
Click **+ Add Expense** from anywhere:
- **Category**: Select from Rent, Electricity, Grocery, Maid, LPG, etc.
- **Paid By**: Select which flatmate paid.
- **Participating Members**: Check or uncheck members (e.g., if a member was away, uncheck them).
- **Split Type**:
  - **Equal Split**: Automatically calculates per-person share to exact paise without rounding errors.
  - **Custom Split**: Set exact amounts per member with real-time sum validation.
- **Multi-month Billing**: Add a Billing Period Start & End (e.g., Electricity for Sep–Nov).

### 4. Debt Minimization (Settlement Simplification)
Instead of messy cross-payments, the algorithm pairs debtors and creditors greedily to achieve the minimal number of peer-to-peer transfers.

### 5. 1-Click UPI Deep Links & QR Codes
Click **Pay UPI** on any pending settlement:
- Generates standard UPI link: `upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...`
- Displays a scannable QR Code for Google Pay, PhonePe, Paytm, or BHIM.
- "Mark as Paid" button instantly updates everyone's balance in the flat.

### 6. Mobile & Android Deployment
- **Local Wi-Fi**: Visit `http://<YOUR_WIFI_IP>:5173/` or `http://<YOUR_WIFI_IP>:8000/` from any phone on the flat Wi-Fi.
- **Installable PWA**: Open in Chrome on Android -> tap (⋮) -> **Install App** / **Add to Home screen** for a full native app experience with zero browser bars.
- **Public Cloud Hosting**: Deploy with `Dockerfile` or `render.yaml` to Render/Railway for 24/7 access from mobile data outside the flat.

### 7. Safe Recurring Expenses
Templates for Rent, Maid, WiFi, etc. Protects against duplicate accidental charges by requiring a manual click on **Create This Month's Expense** to review and post.

### 8. Changing Flat Members & Custom Categories
Navigate to **Settings**:
- Rename any flat members (e.g., Member 1 -> Rahul, Member 2 -> Amit).
- Enter their real UPI IDs (e.g. `rahul@okhdfcbank`).
- Add custom expense categories (e.g., "Society Maintenance", "Water Tanker").
- Soft deletion protects historical integrity: members or categories with historical records cannot be accidentally deleted.

---

## 📡 API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/members` | List active flat members |
| `POST` | `/api/members` | Add a new flat member |
| `PUT` | `/api/members/{id}` | Update member name, email, or UPI ID |
| `DELETE` | `/api/members/{id}` | Remove member (soft-delete if records exist) |
| `GET` | `/api/categories` | List expense categories |
| `POST` | `/api/categories` | Add custom category |
| `GET` | `/api/expenses` | List expenses with search & filters |
| `POST` | `/api/expenses` | Record a collective expense with splits |
| `PUT` | `/api/expenses/{id}` | Edit an expense (recalculates balances) |
| `DELETE` | `/api/expenses/{id}` | Delete an expense (recalculates balances) |
| `GET` | `/api/balances` | Get net balances for all members |
| `GET` | `/api/settlements` | Get simplified settlements plan with UPI links |
| `GET` | `/api/payments` | List recorded settlements & status |
| `POST` | `/api/payments` | Record a settlement payment |
| `PUT` | `/api/payments/{id}` | Update payment status (e.g. "Paid") |
| `GET` | `/api/recurring` | List recurring expense templates |
| `POST` | `/api/recurring/{id}/create-expense` | Post expense from recurring template |
| `GET` | `/api/dashboard` | Dashboard stats, balances, and breakdown |
| `GET` | `/api/monthly-history` | List of all historical months |
| `GET` | `/api/monthly-summary/{year}/{month}` | Detailed report for specific month |
| `POST` | `/api/seed-demo-data` | Load sample flat expenses |
| `POST` | `/api/reset-data` | Reset transactions to clean state |

---

## 🔒 Financial Integrity Rules Enforced

1. **No Float Drift**: All amounts and splits use `Decimal(10, 2)` precision with exact penny/paise distribution.
2. **Zero-Sum Conservation**: `Sum(All Net Balances) == 0` at all times.
3. **Split Validation**: Total splits must equal the expense amount to 2 decimal places.
4. **Historical Preservation**: Deleting or deactivating members and categories does not corrupt old transactions.
5. **No Credential Storage**: Only standard UPI deep links and IDs are used; no banking passwords, PINs, or card details are ever requested or stored.

from sqlalchemy.orm import Session
from app.models.category import Category

DEFAULT_CATEGORIES = [
    {"name": "Rent", "description": "Monthly flat rent"},
    {"name": "Electricity", "description": "Bi-monthly or quarterly electricity bill"},
    {"name": "Grocery", "description": "Shared vegetables, spices, daily provisions"},
    {"name": "LPG Gas", "description": "Cooking gas cylinder refill"},
    {"name": "Maid", "description": "Monthly domestic cook / maid charges"},
    {"name": "Toilet Cleaning", "description": "Cleaning supplies, toilet acid, phenyle, brush"},
    {"name": "Extra Equipment", "description": "One-time appliances e.g. cooker, water purifier, iron"},
    {"name": "Water", "description": "Drinking water jars, tanker or municipal water charges"},
    {"name": "Internet / WiFi", "description": "Broadband fiber internet bill"},
    {"name": "Maintenance / Repair", "description": "Plumbing, electrical fixing, society maintenance"},
    {"name": "Other", "description": "Miscellaneous shared expenses"},
]

def seed_initial_data(db: Session):
    # Seed default categories if database is empty
    existing_categories = db.query(Category).count()
    if existing_categories == 0:
        for c in DEFAULT_CATEGORIES:
            category = Category(
                name=c["name"],
                description=c["description"],
                is_active=True
            )
            db.add(category)
        db.commit()

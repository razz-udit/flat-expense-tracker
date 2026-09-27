from sqlalchemy.orm import Session
from app.models.category import Category

def seed_initial_data(db: Session):
    """
    Initial seed service.
    Predefined categories are intentionally disabled: categories are 100% dynamic and user-defined.
    """
    pass


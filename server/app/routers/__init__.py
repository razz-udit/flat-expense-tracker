from app.routers.members import router as members_router
from app.routers.categories import router as categories_router
from app.routers.expenses import router as expenses_router
from app.routers.payments import router as payments_router
from app.routers.recurring import router as recurring_router
from app.routers.dashboard import router as dashboard_router
from app.routers.auth import router as auth_router

__all__ = [
    "members_router",
    "categories_router",
    "expenses_router",
    "payments_router",
    "recurring_router",
    "dashboard_router",
    "auth_router"
]

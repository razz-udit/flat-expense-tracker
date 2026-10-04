from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class AuditLogOut(BaseModel):
    id: int
    timestamp: datetime
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    details: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

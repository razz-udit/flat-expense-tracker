import json
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.models.member import Member

SENSITIVE_KEYS = {"password", "new_password", "current_password", "token", "secret", "credential", "auth_secret", "claim_token"}

def _sanitize_details(details: Any) -> Optional[str]:
    if details is None:
        return None
    if isinstance(details, dict):
        sanitized = {}
        for k, v in details.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                sanitized[k] = "[REDACTED]"
            elif isinstance(v, dict):
                sanitized[k] = json.loads(_sanitize_details(v) or "{}")
            else:
                sanitized[k] = str(v)
        return json.dumps(sanitized)
    return str(details)

def log_audit(
    db: Session,
    action: str,
    entity_type: str = "general",
    entity_id: Optional[int] = None,
    actor: Optional[Member] = None,
    details: Optional[Any] = None,
    **kwargs
) -> AuditLog:
    """
    Appends an immutable audit log entry.
    Ensures that actor identity is recorded and sensitive data is redacted.
    """
    actor_id = kwargs.get("actor_id") or kwargs.get("member_id")
    actor_name = kwargs.get("actor_name")
    if actor:
        actor_id = actor.id
        actor_name = actor.name
    elif actor_id and not actor_name:
        actor_member = db.query(Member).filter(Member.id == actor_id).first()
        if actor_member:
            actor_name = actor_member.name

    clean_details = _sanitize_details(details)
    log_entry = AuditLog(
        actor_id=actor_id,
        actor_name=actor_name or "System",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=clean_details
    )
    db.add(log_entry)
    try:
        db.commit()
    except Exception:
        db.rollback()
    return log_entry

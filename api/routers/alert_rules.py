from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime
from api.database import get_db
from api.models import AlertRule, Alert, Ownership, User
from api.auth import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

VALID_METRICS   = {"pm25", "pm10", "pm1", "pm4", "voc", "temperature", "humidity", "aqi"}
VALID_OPERATORS = {"gt", "lt"}

METRIC_LABELS = {
    "pm25": "PM2.5", "pm10": "PM10", "pm1": "PM1", "pm4": "PM4",
    "voc": "VOC Index", "temperature": "Temperature", "humidity": "Humidity", "aqi": "AQI",
}


async def assert_owns(user: User, device_id: str, db: AsyncSession):
    r = await db.execute(
        select(Ownership).where(Ownership.user_id == user.id, Ownership.device_id == device_id)
    )
    if not r.scalar_one_or_none():
        raise HTTPException(403, "Device not in your account")


# ── Alert history ─────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    id:        int
    device_id: str
    timestamp: datetime
    type:      str
    message:   str
    threshold: float
    value:     float
    resolved:  bool


@router.get("/history", response_model=list[AlertOut])
async def alert_history(
    device_id: str | None = None,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Get all devices this user owns
    owned = await db.execute(
        select(Ownership.device_id).where(Ownership.user_id == current_user.id)
    )
    device_ids = [r for (r,) in owned.all()]
    if not device_ids:
        return []

    q = select(Alert).where(Alert.device_id.in_(device_ids))
    if device_id:
        q = q.where(Alert.device_id == device_id)
    q = q.order_by(Alert.timestamp.desc()).limit(limit)
    r = await db.execute(q)
    return r.scalars().all()


@router.put("/history/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    await assert_owns(current_user, alert.device_id, db)
    alert.resolved = True
    await db.commit()
    await db.refresh(alert)
    return alert


# ── Alert rules ───────────────────────────────────────────────────────────────

class RuleIn(BaseModel):
    device_id: str
    metric:    str
    operator:  str   # gt | lt
    threshold: float
    enabled:   bool = True


class RuleOut(BaseModel):
    id:        int
    device_id: str
    metric:    str
    operator:  str
    threshold: float
    enabled:   bool
    created_at: datetime


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(AlertRule).where(AlertRule.user_id == current_user.id)
        .order_by(AlertRule.created_at.desc())
    )
    return r.scalars().all()


@router.post("/rules", response_model=RuleOut)
async def create_rule(
    body: RuleIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.metric not in VALID_METRICS:
        raise HTTPException(400, f"Invalid metric. Choose from: {', '.join(VALID_METRICS)}")
    if body.operator not in VALID_OPERATORS:
        raise HTTPException(400, "Operator must be 'gt' or 'lt'")
    await assert_owns(current_user, body.device_id, db)

    rule = AlertRule(
        user_id=current_user.id,
        device_id=body.device_id,
        metric=body.metric,
        operator=body.operator,
        threshold=body.threshold,
        enabled=body.enabled,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    body: RuleIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await db.get(AlertRule, rule_id)
    if not rule or rule.user_id != current_user.id:
        raise HTTPException(404, "Rule not found")
    await assert_owns(current_user, body.device_id, db)
    rule.metric    = body.metric
    rule.operator  = body.operator
    rule.threshold = body.threshold
    rule.enabled   = body.enabled
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await db.get(AlertRule, rule_id)
    if not rule or rule.user_id != current_user.id:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()

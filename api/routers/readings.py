from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime
from api.database import get_db
from api.models import SensorReading, AQIResult, Alert, Ownership, User
from api.auth import get_current_user

router = APIRouter(prefix="/api/readings", tags=["readings"])


class ReadingOut(BaseModel):
    timestamp:   datetime
    pm1:         float | None
    pm25:        float | None
    pm4:         float | None
    pm10:        float | None
    temperature: float | None
    humidity:    float | None
    voc:         float | None


class AQIOut(BaseModel):
    timestamp: datetime
    aqi:       int
    category:  str


class AlertOut(BaseModel):
    id:        int
    device_id: str
    timestamp: datetime
    type:      str
    message:   str
    threshold: float
    value:     float
    resolved:  bool


async def assert_owns_device(user: User, device_id: str, db: AsyncSession):
    result = await db.execute(
        select(Ownership).where(
            Ownership.user_id   == user.id,
            Ownership.device_id == device_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Device not in your account")


@router.get("/{device_id}/latest", response_model=ReadingOut)
async def latest_reading(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns_device(current_user, device_id, db)
    result = await db.execute(
        select(SensorReading)
        .where(SensorReading.device_id == device_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No readings found")
    return row


@router.get("/{device_id}/history", response_model=list[ReadingOut])
async def reading_history(
    device_id: str,
    limit: int = Query(default=60, le=1440),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns_device(current_user, device_id, db)
    result = await db.execute(
        select(SensorReading)
        .where(SensorReading.device_id == device_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{device_id}/aqi", response_model=list[AQIOut])
async def aqi_history(
    device_id: str,
    limit: int = Query(default=60, le=1440),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns_device(current_user, device_id, db)
    result = await db.execute(
        select(AQIResult)
        .where(AQIResult.device_id == device_id)
        .order_by(desc(AQIResult.timestamp))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{device_id}/alerts", response_model=list[AlertOut])
async def device_alerts(
    device_id: str,
    limit: int = Query(default=20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns_device(current_user, device_id, db)
    result = await db.execute(
        select(Alert)
        .where(Alert.device_id == device_id)
        .order_by(desc(Alert.timestamp))
        .limit(limit)
    )
    return result.scalars().all()

import csv
import io
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, extract
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from api.database import get_db
from api.models import SensorReading, AQIResult, Ownership, User
from api.auth import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

METRICS = ["pm1", "pm25", "pm4", "pm10", "temperature", "humidity", "voc"]


async def assert_owns(user: User, device_id: str, db: AsyncSession):
    r = await db.execute(
        select(Ownership).where(Ownership.user_id == user.id, Ownership.device_id == device_id)
    )
    if not r.scalar_one_or_none():
        raise HTTPException(403, "Device not in your account")


class StatRow(BaseModel):
    metric: str
    min: float | None
    max: float | None
    mean: float | None
    count: int


@router.get("/{device_id}/stats", response_model=list[StatRow])
async def stats(
    device_id: str,
    hours: int = Query(default=24, le=720),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns(current_user, device_id, db)
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = []
    col_map = {
        "pm1": SensorReading.pm1, "pm25": SensorReading.pm25,
        "pm4":  SensorReading.pm4, "pm10": SensorReading.pm10,
        "temperature": SensorReading.temperature,
        "humidity": SensorReading.humidity, "voc": SensorReading.voc,
    }
    for metric, col in col_map.items():
        r = await db.execute(
            select(
                func.min(col), func.max(col), func.avg(col), func.count(col)
            ).where(SensorReading.device_id == device_id, SensorReading.timestamp >= since)
        )
        mn, mx, avg, cnt = r.one()
        rows.append(StatRow(
            metric=metric,
            min=round(mn, 2) if mn is not None else None,
            max=round(mx, 2) if mx is not None else None,
            mean=round(avg, 2) if avg is not None else None,
            count=cnt,
        ))
    return rows


class HourlyPoint(BaseModel):
    hour: int
    pm25: float | None
    temperature: float | None
    humidity: float | None
    voc: float | None


@router.get("/{device_id}/hourly", response_model=list[HourlyPoint])
async def hourly_avg(
    device_id: str,
    days: int = Query(default=7, le=30),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns(current_user, device_id, db)
    since = datetime.utcnow() - timedelta(days=days)
    hour_col = extract("hour", SensorReading.timestamp).label("hour")
    r = await db.execute(
        select(
            hour_col,
            func.avg(SensorReading.pm25).label("pm25"),
            func.avg(SensorReading.temperature).label("temperature"),
            func.avg(SensorReading.humidity).label("humidity"),
            func.avg(SensorReading.voc).label("voc"),
        )
        .where(SensorReading.device_id == device_id, SensorReading.timestamp >= since)
        .group_by(hour_col)
        .order_by(hour_col)
    )
    return [
        HourlyPoint(
            hour=int(row.hour),
            pm25=round(row.pm25, 2) if row.pm25 else None,
            temperature=round(row.temperature, 2) if row.temperature else None,
            humidity=round(row.humidity, 2) if row.humidity else None,
            voc=round(row.voc, 2) if row.voc else None,
        )
        for row in r.all()
    ]


class DailyPoint(BaseModel):
    date: str
    pm25_avg: float | None
    pm10_avg: float | None
    aqi_avg: float | None
    temperature_avg: float | None
    humidity_avg: float | None


@router.get("/{device_id}/daily", response_model=list[DailyPoint])
async def daily_avg(
    device_id: str,
    days: int = Query(default=30, le=365),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns(current_user, device_id, db)
    since = datetime.utcnow() - timedelta(days=days)
    date_col = func.date(SensorReading.timestamp).label("date")
    r = await db.execute(
        select(
            date_col,
            func.avg(SensorReading.pm25).label("pm25"),
            func.avg(SensorReading.pm10).label("pm10"),
            func.avg(SensorReading.temperature).label("temperature"),
            func.avg(SensorReading.humidity).label("humidity"),
        )
        .where(SensorReading.device_id == device_id, SensorReading.timestamp >= since)
        .group_by(date_col)
        .order_by(date_col)
    )
    readings = {str(row.date): row for row in r.all()}

    aqi_date = func.date(AQIResult.timestamp).label("date")
    r2 = await db.execute(
        select(aqi_date, func.avg(AQIResult.aqi).label("aqi"))
        .where(AQIResult.device_id == device_id, AQIResult.timestamp >= since)
        .group_by(aqi_date)
        .order_by(aqi_date)
    )
    aqi_map = {str(row.date): round(row.aqi, 1) for row in r2.all()}

    return [
        DailyPoint(
            date=str(date),
            pm25_avg=round(row.pm25, 2) if row.pm25 else None,
            pm10_avg=round(row.pm10, 2) if row.pm10 else None,
            aqi_avg=aqi_map.get(str(date)),
            temperature_avg=round(row.temperature, 2) if row.temperature else None,
            humidity_avg=round(row.humidity, 2) if row.humidity else None,
        )
        for date, row in readings.items()
    ]


@router.get("/{device_id}/export")
async def export_csv(
    device_id: str,
    hours: int = Query(default=24, le=720),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await assert_owns(current_user, device_id, db)
    since = datetime.utcnow() - timedelta(hours=hours)
    r = await db.execute(
        select(SensorReading)
        .where(SensorReading.device_id == device_id, SensorReading.timestamp >= since)
        .order_by(SensorReading.timestamp)
    )
    readings = r.scalars().all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "pm1", "pm25", "pm4", "pm10", "temperature", "humidity", "voc"])
    for row in readings:
        writer.writerow([row.timestamp, row.pm1, row.pm25, row.pm4, row.pm10,
                         row.temperature, row.humidity, row.voc])

    buf.seek(0)
    filename = f"airwatch_{device_id}_{hours}h.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

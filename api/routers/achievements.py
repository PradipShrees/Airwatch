from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from api.database import get_db
from api.models import User, SensorReading, Alert, Ownership
from api.auth import get_current_user

router = APIRouter(prefix="/api/achievements", tags=["achievements"])


@router.get("/me")
async def get_achievements(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Devices owned
    own_q = await db.execute(
        select(Ownership.device_id).where(Ownership.user_id == current_user.id)
    )
    device_ids = [r[0] for r in own_q.all()]

    if not device_ids:
        return {
            "total_readings": 0, "days_monitoring": 0, "current_streak": 0,
            "longest_streak": 0, "alerts_resolved": 0, "devices": 0, "healthy_days": 0,
        }

    # Total readings
    cnt_q = await db.execute(
        select(func.count(SensorReading.id)).where(SensorReading.device_id.in_(device_ids))
    )
    total_readings = cnt_q.scalar() or 0

    # Days monitoring
    first_q = await db.execute(
        select(func.min(SensorReading.timestamp)).where(SensorReading.device_id.in_(device_ids))
    )
    first_ts = first_q.scalar()
    days_monitoring = (datetime.utcnow().date() - first_ts.date()).days + 1 if first_ts else 0

    # Alerts resolved
    res_q = await db.execute(
        select(func.count(Alert.id)).where(Alert.device_id.in_(device_ids), Alert.resolved == True)
    )
    alerts_resolved = res_q.scalar() or 0

    # Daily PM2.5 averages
    daily_q = await db.execute(
        text("""
            SELECT DATE(timestamp) AS d, AVG(pm25) AS avg_pm25
            FROM sensor_readings
            WHERE device_id = ANY(:ids) AND pm25 IS NOT NULL
            GROUP BY DATE(timestamp)
            ORDER BY d
        """).bindparams(ids=device_ids)
    )
    daily = [(row[0], float(row[1])) for row in daily_q.all() if row[1] is not None]

    healthy_set = {d for d, avg in daily if avg < 12}
    healthy_days = len(healthy_set)

    # Current streak: walk backwards from today
    today = date.today()
    current_streak = 0
    check = today
    while check in healthy_set:
        current_streak += 1
        check -= timedelta(days=1)

    # Longest streak: scan in date order
    longest_streak = 0
    run = 0
    prev = None
    for d in sorted(healthy_set):
        if prev is not None and (d - prev).days == 1:
            run += 1
        else:
            run = 1
        longest_streak = max(longest_streak, run)
        prev = d

    return {
        "total_readings":  total_readings,
        "days_monitoring": days_monitoring,
        "current_streak":  current_streak,
        "longest_streak":  longest_streak,
        "alerts_resolved": alerts_resolved,
        "devices":         len(device_ids),
        "healthy_days":    healthy_days,
    }

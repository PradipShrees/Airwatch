from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from api.database import get_db
from api.models import User, Ownership
from api.auth import get_current_user

router = APIRouter(prefix="/api/insights", tags=["insights"])

DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


async def _verify_device(device_id: str, user: User, db: AsyncSession):
    r = await db.execute(
        select(Ownership).where(Ownership.device_id == device_id, Ownership.user_id == user.id)
    )
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Device not found")


@router.get("/{device_id}")
async def get_insights(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_device(device_id, current_user, db)

    # Hourly PM2.5 averages over last 30 days
    hourly_q = await db.execute(text("""
        SELECT EXTRACT(HOUR FROM timestamp)::int AS h,
               AVG(pm25) AS v,
               COUNT(*)  AS n
        FROM sensor_readings
        WHERE device_id = :d
          AND timestamp >= NOW() - INTERVAL '30 days'
          AND pm25 IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    """).bindparams(d=device_id))
    hourly = [{"hour": int(r[0]), "pm25": round(float(r[1]), 1), "n": int(r[2])} for r in hourly_q.all()]

    # Day-of-week PM2.5 averages
    dow_q = await db.execute(text("""
        SELECT EXTRACT(DOW FROM timestamp)::int AS d,
               AVG(pm25) AS v
        FROM sensor_readings
        WHERE device_id = :d
          AND timestamp >= NOW() - INTERVAL '30 days'
          AND pm25 IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    """).bindparams(d=device_id))
    dow = [{"dow": int(r[0]), "day": DOW_NAMES[int(r[0])], "pm25": round(float(r[1]), 1)} for r in dow_q.all()]

    # Healthy % (PM2.5 < 12)
    h7_q = await db.execute(text("""
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN pm25 < 12 THEN 1 ELSE 0 END), 0) AS healthy
        FROM sensor_readings
        WHERE device_id = :d
          AND timestamp >= NOW() - INTERVAL '7 days'
          AND pm25 IS NOT NULL
    """).bindparams(d=device_id))
    t7, h7 = h7_q.one()

    h30_q = await db.execute(text("""
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN pm25 < 12 THEN 1 ELSE 0 END), 0) AS healthy
        FROM sensor_readings
        WHERE device_id = :d
          AND timestamp >= NOW() - INTERVAL '30 days'
          AND pm25 IS NOT NULL
    """).bindparams(d=device_id))
    t30, h30 = h30_q.one()

    # Week-over-week trend
    trend_q = await db.execute(text("""
        SELECT
          AVG(CASE WHEN timestamp >= NOW() - INTERVAL '7 days' THEN pm25 END) AS this_wk,
          AVG(CASE WHEN timestamp >= NOW() - INTERVAL '14 days'
                    AND timestamp <  NOW() - INTERVAL '7 days'  THEN pm25 END) AS last_wk
        FROM sensor_readings
        WHERE device_id = :d AND pm25 IS NOT NULL
    """).bindparams(d=device_id))
    this_wk, last_wk = trend_q.one()
    this_wk = float(this_wk) if this_wk is not None else None
    last_wk = float(last_wk) if last_wk is not None else None
    delta_pct = ((this_wk - last_wk) / last_wk * 100) if (this_wk is not None and last_wk) else None

    # VOC/humidity context
    ctx_q = await db.execute(text("""
        SELECT AVG(voc), AVG(humidity), AVG(temperature)
        FROM sensor_readings
        WHERE device_id = :d
          AND timestamp >= NOW() - INTERVAL '7 days'
    """).bindparams(d=device_id))
    avg_voc, avg_hum, avg_temp = ctx_q.one()

    peak_hour = max(hourly, key=lambda x: x["pm25"]) if hourly else None
    best_hour = min(hourly, key=lambda x: x["pm25"]) if hourly else None
    worst_dow = max(dow, key=lambda x: x["pm25"]) if dow else None
    best_dow  = min(dow, key=lambda x: x["pm25"]) if dow else None

    return {
        "hourly":          hourly,
        "dow":             dow,
        "healthy_pct_7d":  round((h7  / t7  * 100) if t7  else 0, 1),
        "healthy_pct_30d": round((h30 / t30 * 100) if t30 else 0, 1),
        "this_wk_avg":     round(this_wk, 1) if this_wk is not None else None,
        "last_wk_avg":     round(last_wk, 1) if last_wk is not None else None,
        "delta_pct":       round(delta_pct, 1) if delta_pct is not None else None,
        "peak_hour":       peak_hour,
        "best_hour":       best_hour,
        "worst_dow":       worst_dow,
        "best_dow":        best_dow,
        "avg_voc_7d":      round(float(avg_voc), 1)  if avg_voc  is not None else None,
        "avg_hum_7d":      round(float(avg_hum), 1)  if avg_hum  is not None else None,
        "avg_temp_7d":     round(float(avg_temp), 1) if avg_temp is not None else None,
        "samples_30d":     int(t30) if t30 else 0,
    }

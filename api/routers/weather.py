from datetime import datetime, timezone
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from api.database import get_db
from api.models import User
from api.auth import get_current_user

router = APIRouter(prefix="/api/weather", tags=["weather"])

OPEN_METEO_AQI = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_WX  = "https://api.open-meteo.com/v1/forecast"


@router.get("/outdoor")
async def get_outdoor(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lat = current_user.latitude
    lon = current_user.longitude
    if lat is None or lon is None:
        raise HTTPException(404, "No location set. Set your location in Settings.")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            aq_r = await client.get(OPEN_METEO_AQI, params={
                "latitude": lat, "longitude": lon,
                "current": "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide",
                "hourly":  "us_aqi,pm2_5",
                "forecast_days": 2,
            })
            w_r = await client.get(OPEN_METEO_WX, params={
                "latitude": lat, "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
            })
        aq_r.raise_for_status()
        w_r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Weather upstream failed: {e}")

    aq = aq_r.json()
    w  = w_r.json()
    cur_aq = aq.get("current", {})
    cur_w  = w.get("current", {})

    return {
        "location_name": current_user.location_name,
        "latitude":      lat,
        "longitude":     lon,
        "aqi":           cur_aq.get("us_aqi"),
        "pm25":          cur_aq.get("pm2_5"),
        "pm10":          cur_aq.get("pm10"),
        "ozone":         cur_aq.get("ozone"),
        "no2":           cur_aq.get("nitrogen_dioxide"),
        "temperature":   cur_w.get("temperature_2m"),
        "humidity":      cur_w.get("relative_humidity_2m"),
        "wind_speed":    cur_w.get("wind_speed_10m"),
        "weather_code":  cur_w.get("weather_code"),
    }


@router.get("/forecast")
async def get_forecast(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lat, lon = current_user.latitude, current_user.longitude
    if lat is None or lon is None:
        raise HTTPException(404, "No location set. Set your location in Settings.")

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            aq_r = await client.get(OPEN_METEO_AQI, params={
                "latitude": lat, "longitude": lon,
                "hourly": "us_aqi,pm2_5,pm10,ozone",
                "forecast_days": 3,
            })
            w_r  = await client.get(OPEN_METEO_WX, params={
                "latitude": lat, "longitude": lon,
                "hourly":  "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
                "forecast_days": 3,
                "timezone": "auto",
            })
        aq_r.raise_for_status(); w_r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Forecast upstream failed: {e}")

    aq = aq_r.json().get("hourly", {})
    w  = w_r.json().get("hourly", {})
    times = aq.get("time", []) or []

    # Find first hour >= now (UTC). Open-Meteo "time" is local ISO strings without TZ.
    # Just align by current UTC hour string.
    now_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:")
    start = 0
    for i, t in enumerate(times):
        if t >= now_prefix:
            start = i
            break
    end = min(start + 48, len(times))

    def at(key, src, i):
        arr = src.get(key) or []
        return arr[i] if i < len(arr) else None

    hours = []
    for i in range(start, end):
        hours.append({
            "time":          times[i],
            "aqi":           at("us_aqi", aq, i),
            "pm25":          at("pm2_5",  aq, i),
            "pm10":          at("pm10",   aq, i),
            "ozone":         at("ozone",  aq, i),
            "temperature":   at("temperature_2m",      w, i),
            "humidity":      at("relative_humidity_2m", w, i),
            "wind_speed":    at("wind_speed_10m",      w, i),
            "precipitation": at("precipitation",       w, i),
            "weather_code":  at("weather_code",        w, i),
        })

    return {
        "location_name": current_user.location_name,
        "hours":         hours,
    }


@router.get("/geocode")
async def geocode(q: str):
    """Forward geocoding via Open-Meteo (no API key, global coverage)."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get("https://geocoding-api.open-meteo.com/v1/search", params={
                "name": q, "count": 10, "language": "en", "format": "json",
            })
            r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Geocoder upstream failed: {e}")

    results = r.json().get("results", []) or []
    return [
        {
            "name":         item.get("name"),
            "admin":        item.get("admin1"),
            "country":      item.get("country"),
            "country_code": item.get("country_code"),
            "population":   item.get("population"),
            "latitude":     item.get("latitude"),
            "longitude":    item.get("longitude"),
            "label":        ", ".join([p for p in [item.get("name"), item.get("admin1"), item.get("country")] if p]),
        }
        for item in results
    ]

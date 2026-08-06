import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from api.database import engine, Base
from api.routers import auth, devices, readings, ws, analytics, alert_rules, settings, weather, achievements, insights

app = FastAPI(title="AirWatch API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Idempotent migrations for columns added after initial schema
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS location_name VARCHAR(128)"))


app.include_router(auth.router)
app.include_router(devices.router)
app.include_router(readings.router)
app.include_router(ws.router)
app.include_router(analytics.router)
app.include_router(alert_rules.router)
app.include_router(settings.router)
app.include_router(weather.router)
app.include_router(achievements.router)
app.include_router(insights.router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}

"""Shared config loaded from environment / .env file."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

KAFKA_BOOTSTRAP  = os.environ.get("KAFKA_BOOTSTRAP",  "localhost:9092")
DATABASE_URL     = os.environ.get("DATABASE_URL",      "postgresql://airwatch_app:airwatch_secret@localhost:5432/airwatch")
TOPIC_RAW        = "sensor.raw"
TOPIC_HEALTH     = "system.health"
TOPIC_AQI        = "aqi.computed"
TOPIC_ALERTS     = "alerts"

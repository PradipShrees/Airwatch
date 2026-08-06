#!/usr/bin/env python3
"""
AQI Processor
Consumes sensor.raw, computes US AQI from PM2.5,
stores result in PostgreSQL aqi_results, publishes to aqi.computed.
"""

import json
import sys
import logging
import psycopg2
from datetime import datetime, timezone
from confluent_kafka import Consumer, Producer, KafkaError

sys.path.insert(0, "/home/raspberry/airwatch/services")
from config import KAFKA_BOOTSTRAP, DATABASE_URL, TOPIC_RAW, TOPIC_AQI

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [aqi] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# US EPA AQI breakpoints for PM2.5 (μg/m³)
PM25_BREAKPOINTS = [
    # (C_low, C_high, I_low, I_high, category)
    (0.0,   12.0,   0,   50,  "Good"),
    (12.1,  35.4,  51,  100,  "Moderate"),
    (35.5,  55.4, 101,  150,  "Unhealthy for Sensitive Groups"),
    (55.5, 150.4, 151,  200,  "Unhealthy"),
    (150.5, 250.4, 201, 300,  "Very Unhealthy"),
    (250.5, 500.4, 301, 500,  "Hazardous"),
]

INSERT_SQL = """
INSERT INTO aqi_results (device_id, timestamp, aqi, category, dominant_pollutant)
VALUES (%(device_id)s, %(timestamp)s, %(aqi)s, %(category)s, %(dominant_pollutant)s);
"""


def compute_aqi_pm25(pm25: float) -> tuple[int, str]:
    pm25 = round(pm25, 1)
    for c_lo, c_hi, i_lo, i_hi, category in PM25_BREAKPOINTS:
        if c_lo <= pm25 <= c_hi:
            aqi = round((i_hi - i_lo) / (c_hi - c_lo) * (pm25 - c_lo) + i_lo)
            return aqi, category
    if pm25 > 500.4:
        return 500, "Hazardous"
    return 0, "Good"


def get_conn():
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def main():
    conn = get_conn()
    conn.autocommit = True
    cur = conn.cursor()

    producer = Producer({"bootstrap.servers": KAFKA_BOOTSTRAP})
    consumer = Consumer({
        "bootstrap.servers":  KAFKA_BOOTSTRAP,
        "group.id":           "aqi-processor",
        "auto.offset.reset":  "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([TOPIC_RAW])
    log.info("AQI Processor running")

    try:
        while True:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() != KafkaError._PARTITION_EOF:
                    log.error("Kafka error: %s", msg.error())
                continue

            try:
                data  = json.loads(msg.value())
                pm25  = data.get("pm25")
                if pm25 is None:
                    continue

                aqi, category = compute_aqi_pm25(float(pm25))
                timestamp     = data.get("timestamp", datetime.now(timezone.utc).isoformat())
                device_id     = data["device_id"]

                row = {
                    "device_id":          device_id,
                    "timestamp":          timestamp,
                    "aqi":                aqi,
                    "category":           category,
                    "dominant_pollutant": "PM2.5",
                }
                cur.execute(INSERT_SQL, row)

                event = {**row, "pm25": pm25}
                producer.produce(
                    TOPIC_AQI,
                    key=device_id,
                    value=json.dumps(event),
                )
                producer.poll(0)
                log.info("Device %s — PM2.5=%.1f → AQI=%d (%s)", device_id, pm25, aqi, category)

            except Exception as e:
                log.error("Processing error: %s", e)

    except KeyboardInterrupt:
        log.info("Stopped.")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    main()

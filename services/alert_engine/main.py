#!/usr/bin/env python3
"""
Alert Engine
Consumes aqi.computed, checks thresholds, stores alerts in PostgreSQL,
publishes to alerts topic.
Deduplicates: only fires an alert when AQI crosses a threshold boundary,
not on every message while it stays above it.
"""

import json
import sys
import logging
import psycopg2
from datetime import datetime, timezone
from confluent_kafka import Consumer, Producer, KafkaError

sys.path.insert(0, "/home/raspberry/airwatch/services")
from config import KAFKA_BOOTSTRAP, DATABASE_URL, TOPIC_AQI, TOPIC_ALERTS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [alerts] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

# Thresholds: (AQI >= value) → alert type
THRESHOLDS = [
    (301, "hazardous",              "AQI is Hazardous ({aqi})"),
    (201, "very_unhealthy",         "AQI is Very Unhealthy ({aqi})"),
    (151, "unhealthy",              "AQI is Unhealthy ({aqi})"),
    (101, "unhealthy_sensitive",    "AQI is Unhealthy for Sensitive Groups ({aqi})"),
    (51,  "moderate",               "AQI is Moderate ({aqi})"),
]

INSERT_SQL = """
INSERT INTO alerts (device_id, timestamp, type, message, threshold, value)
VALUES (%(device_id)s, %(timestamp)s, %(type)s, %(message)s, %(threshold)s, %(value)s)
RETURNING id;
"""

# device_id → last alert type fired (to avoid duplicates)
last_alert: dict[str, str | None] = {}


def get_alert_level(aqi: int) -> tuple[int, str, str] | None:
    for threshold, alert_type, message_tpl in THRESHOLDS:
        if aqi >= threshold:
            return threshold, alert_type, message_tpl
    return None


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
        "group.id":           "alert-engine",
        "auto.offset.reset":  "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([TOPIC_AQI])
    log.info("Alert Engine running")

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
                data      = json.loads(msg.value())
                device_id = data["device_id"]
                aqi       = int(data["aqi"])
                timestamp = data.get("timestamp", datetime.now(timezone.utc).isoformat())

                result = get_alert_level(aqi)
                current_type = result[1] if result else None

                # Only act when the alert level changes
                if current_type == last_alert.get(device_id):
                    continue

                last_alert[device_id] = current_type

                if result is None:
                    log.info("Device %s AQI=%d — back to Good", device_id, aqi)
                    continue

                threshold, alert_type, message_tpl = result
                message = message_tpl.format(aqi=aqi)

                row = {
                    "device_id": device_id,
                    "timestamp": timestamp,
                    "type":      alert_type,
                    "message":   message,
                    "threshold": threshold,
                    "value":     float(aqi),
                }
                cur.execute(INSERT_SQL, row)
                alert_id = cur.fetchone()[0]

                event = {**row, "id": alert_id}
                producer.produce(
                    TOPIC_ALERTS,
                    key=device_id,
                    value=json.dumps(event),
                )
                producer.poll(0)
                log.info("Alert fired for %s: %s (AQI=%d)", device_id, alert_type, aqi)

            except Exception as e:
                log.error("Processing error: %s", e)

    except KeyboardInterrupt:
        log.info("Stopped.")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    main()

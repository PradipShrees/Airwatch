#!/usr/bin/env python3
"""
Storage Consumer
Consumes sensor.raw and persists every reading to PostgreSQL sensor_readings table.
"""

import json
import sys
import logging
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
from confluent_kafka import Consumer, KafkaError

sys.path.insert(0, "/home/raspberry/airwatch/services")
from config import KAFKA_BOOTSTRAP, DATABASE_URL, TOPIC_RAW

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [storage] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

INSERT_SQL = """
INSERT INTO sensor_readings
  (device_id, timestamp, pm1, pm25, pm4, pm10, temperature, humidity, voc)
VALUES
  (%(device_id)s, %(timestamp)s, %(pm1)s, %(pm25)s, %(pm4)s, %(pm10)s,
   %(temperature)s, %(humidity)s, %(voc)s)
ON CONFLICT DO NOTHING;
"""


def get_conn():
    # psycopg2 uses postgresql:// not postgresql+asyncpg://
    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(url)


def main():
    conn = get_conn()
    conn.autocommit = True
    cur = conn.cursor()
    log.info("Connected to PostgreSQL")

    consumer = Consumer({
        "bootstrap.servers":  KAFKA_BOOTSTRAP,
        "group.id":           "storage-consumer",
        "auto.offset.reset":  "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([TOPIC_RAW])
    log.info("Subscribed to %s", TOPIC_RAW)

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
                data = json.loads(msg.value())
                data["timestamp"] = data.get("timestamp", datetime.now(timezone.utc).isoformat())
                cur.execute(INSERT_SQL, data)
                log.debug("Stored reading for device %s", data.get("device_id"))
            except Exception as e:
                log.error("Failed to store reading: %s | data=%s", e, msg.value())

    except KeyboardInterrupt:
        log.info("Stopped.")
    finally:
        consumer.close()
        conn.close()


if __name__ == "__main__":
    main()

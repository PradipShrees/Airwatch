#!/usr/bin/env python3
"""
Device Health Service
Consumes sensor.raw to track heartbeats.
Publishes online/offline events to system.health topic.
A device is considered offline if no message received in OFFLINE_THRESHOLD seconds.
"""

import json
import sys
import logging
import threading
import time
from datetime import datetime, timezone
from confluent_kafka import Consumer, Producer, KafkaError

sys.path.insert(0, "/home/raspberry/airwatch/services")
from config import KAFKA_BOOTSTRAP, TOPIC_RAW, TOPIC_HEALTH

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [health] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

OFFLINE_THRESHOLD = 30   # seconds without a message → device offline
CHECK_INTERVAL    = 10   # how often to check for offline devices

# device_id → {"last_seen": float, "status": "online"|"offline"}
device_state: dict[str, dict] = {}
state_lock = threading.Lock()


def publish_event(producer: Producer, device_id: str, status: str):
    event = {
        "device_id": device_id,
        "status":    status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    producer.produce(
        TOPIC_HEALTH,
        key=device_id,
        value=json.dumps(event),
    )
    producer.poll(0)
    log.info("Device %s → %s", device_id, status)


def watchdog(producer: Producer):
    """Background thread: marks devices offline when they stop sending."""
    while True:
        time.sleep(CHECK_INTERVAL)
        now = time.time()
        with state_lock:
            for device_id, state in device_state.items():
                age = now - state["last_seen"]
                if age > OFFLINE_THRESHOLD and state["status"] != "offline":
                    state["status"] = "offline"
                    publish_event(producer, device_id, "offline")


def main():
    producer = Producer({"bootstrap.servers": KAFKA_BOOTSTRAP})
    consumer = Consumer({
        "bootstrap.servers":  KAFKA_BOOTSTRAP,
        "group.id":           "device-health",
        "auto.offset.reset":  "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([TOPIC_RAW])

    threading.Thread(target=watchdog, args=(producer,), daemon=True).start()
    log.info("Watching heartbeats on %s", TOPIC_RAW)

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
                device_id = data.get("device_id")
                if not device_id:
                    continue

                now = time.time()
                with state_lock:
                    prev = device_state.get(device_id)
                    was_offline = prev is None or prev["status"] == "offline"
                    device_state[device_id] = {"last_seen": now, "status": "online"}

                if was_offline:
                    publish_event(producer, device_id, "online")

            except Exception as e:
                log.error("Error processing message: %s", e)

    except KeyboardInterrupt:
        log.info("Stopped.")
    finally:
        consumer.close()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Notification Service
Consumes alerts topic and sends email via Resend.
"""

import json
import sys
import logging
import os
import resend
from datetime import datetime
from confluent_kafka import Consumer, KafkaError

sys.path.insert(0, "/home/raspberry/airwatch/services")
from config import KAFKA_BOOTSTRAP, TOPIC_ALERTS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [notify] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

RESEND_API_KEY  = os.environ.get("RESEND_API_KEY", "")
ALERT_TO_EMAIL  = os.environ.get("ALERT_TO_EMAIL", "")
ALERT_FROM_EMAIL = os.environ.get("ALERT_FROM_EMAIL", "AirWatch <onboarding@resend.dev>")

AQI_COLORS = {
    "good":                   "#00e400",
    "moderate":               "#ffff00",
    "unhealthy_sensitive":    "#ff7e00",
    "unhealthy":              "#ff0000",
    "very_unhealthy":         "#8f3f97",
    "hazardous":              "#7e0023",
}


def build_html(alert: dict) -> str:
    aqi       = int(alert.get("value", 0))
    category  = alert.get("type", "").replace("_", " ").title()
    device_id = alert.get("device_id", "unknown")
    message   = alert.get("message", "")
    timestamp = alert.get("timestamp", datetime.utcnow().isoformat())
    color     = AQI_COLORS.get(alert.get("type", ""), "#cccccc")

    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto">
      <div style="background:{color};padding:24px;border-radius:8px 8px 0 0;text-align:center">
        <h1 style="margin:0;font-size:48px;color:#fff">{aqi}</h1>
        <p style="margin:4px 0 0;color:#fff;font-size:18px;font-weight:bold">AQI — {category}</p>
      </div>
      <div style="background:#f9f9f9;padding:20px;border-radius:0 0 8px 8px">
        <p><strong>Device:</strong> {device_id}</p>
        <p><strong>Alert:</strong> {message}</p>
        <p><strong>Time:</strong> {timestamp}</p>
        <p style="font-size:12px;color:#999;margin-top:24px">
          AirWatch IoT Platform &mdash; Raspberry Pi
        </p>
      </div>
    </div>
    """


def send_alert(alert: dict):
    if not RESEND_API_KEY or not ALERT_TO_EMAIL:
        log.warning("RESEND_API_KEY or ALERT_TO_EMAIL not set — skipping email")
        return

    resend.api_key = RESEND_API_KEY
    aqi      = int(alert.get("value", 0))
    category = alert.get("type", "").replace("_", " ").title()

    resend.Emails.send({
        "from":    ALERT_FROM_EMAIL,
        "to":      [ALERT_TO_EMAIL],
        "subject": f"AirWatch Alert — AQI {aqi} ({category})",
        "html":    build_html(alert),
    })
    log.info("Email sent to %s for device %s AQI=%d", ALERT_TO_EMAIL, alert.get("device_id"), aqi)


def main():
    if not RESEND_API_KEY:
        log.error("RESEND_API_KEY not set. Set it in .env and restart.")
        sys.exit(1)

    consumer = Consumer({
        "bootstrap.servers":  KAFKA_BOOTSTRAP,
        "group.id":           "notification-service",
        "auto.offset.reset":  "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([TOPIC_ALERTS])
    log.info("Notification Service running — sending alerts to %s", ALERT_TO_EMAIL)

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
                alert = json.loads(msg.value())
                send_alert(alert)
            except Exception as e:
                log.error("Failed to send notification: %s", e)

    except KeyboardInterrupt:
        log.info("Stopped.")
    finally:
        consumer.close()


if __name__ == "__main__":
    main()

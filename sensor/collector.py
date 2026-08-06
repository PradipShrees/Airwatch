#!/usr/bin/env python3
"""
SEN54 Sensor Collector
Reads sensor data over I2C and publishes JSON events to Kafka topic: sensor.raw
"""

import json
import time
import os
import sys
import logging
from datetime import datetime, timezone

from confluent_kafka import Producer
from sensirion_i2c_driver import I2cConnection
from sensirion_i2c_sen5x.device import Sen5xI2cDevice
from sensirion_i2c_driver.linux_i2c_transceiver import LinuxI2cTransceiver

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [collector] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)

DEVICE_ID       = os.environ.get("DEVICE_ID", "pi-001")
KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "localhost:9092")
TOPIC           = "sensor.raw"
READ_INTERVAL   = float(os.environ.get("READ_INTERVAL", "2"))
I2C_BUS         = os.environ.get("I2C_BUS", "/dev/i2c-1")


def delivery_report(err, msg):
    if err:
        log.error("Kafka delivery failed: %s", err)


def build_payload(device_id: str, values) -> dict:
    def safe(val, attr):
        try:
            return float(getattr(val, attr))
        except Exception:
            return None

    return {
        "device_id":   device_id,
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "pm1":         safe(values.mass_concentration_1p0,  "physical"),
        "pm25":        safe(values.mass_concentration_2p5,  "physical"),
        "pm4":         safe(values.mass_concentration_4p0,  "physical"),
        "pm10":        safe(values.mass_concentration_10p0, "physical"),
        "temperature": safe(values.ambient_temperature,     "degrees_celsius"),
        "humidity":    safe(values.ambient_humidity,        "percent_rh"),
        "voc":         float(values.voc_index.scaled) if values.voc_index.available else None,
    }


def main():
    producer = Producer({"bootstrap.servers": KAFKA_BOOTSTRAP})

    log.info("Connecting to SEN54 on %s ...", I2C_BUS)
    with LinuxI2cTransceiver(I2C_BUS) as transceiver:
        device = Sen5xI2cDevice(I2cConnection(transceiver))
        device.start_measurement()
        log.info("Measurement started. Warming up 5 s ...")
        time.sleep(5)

        log.info("Publishing to Kafka topic '%s' as device '%s'", TOPIC, DEVICE_ID)
        while True:
            try:
                values  = device.read_measured_values()
                payload = build_payload(DEVICE_ID, values)
                producer.produce(
                    TOPIC,
                    key=DEVICE_ID,
                    value=json.dumps(payload),
                    callback=delivery_report,
                )
                producer.poll(0)
                log.info("Published: pm25=%.1f temp=%.1f°C", payload["pm25"], payload["temperature"])
            except Exception as e:
                log.error("Read error: %s", e)

            time.sleep(READ_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Stopped.")
        sys.exit(0)

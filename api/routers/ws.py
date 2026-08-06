"""
WebSocket endpoint — /api/ws/{device_id}
Broadcasts live sensor.raw Kafka messages to all connected clients watching that device.
"""

import json
import asyncio
import logging
import os
from collections import defaultdict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from confluent_kafka import Consumer, KafkaError

log = logging.getLogger(__name__)
router = APIRouter()

KAFKA_BOOTSTRAP = os.environ.get("KAFKA_BOOTSTRAP", "localhost:9092")

# device_id → set of connected WebSockets
_connections: dict[str, set[WebSocket]] = defaultdict(set)


async def broadcast(device_id: str, message: str):
    dead = set()
    for ws in _connections[device_id]:
        try:
            await ws.send_text(message)
        except Exception:
            dead.add(ws)
    _connections[device_id] -= dead


async def kafka_reader():
    """Single async task that polls Kafka and fans out to WebSocket subscribers."""
    loop = asyncio.get_event_loop()
    consumer = Consumer({
        "bootstrap.servers":  KAFKA_BOOTSTRAP,
        "group.id":           "ws-broadcaster",
        "auto.offset.reset":  "latest",
        "enable.auto.commit": True,
    })
    consumer.subscribe(["sensor.raw", "aqi.computed"])

    try:
        while True:
            msg = await loop.run_in_executor(None, lambda: consumer.poll(0.1))
            if msg is None or msg.error():
                await asyncio.sleep(0.05)
                continue
            try:
                data      = json.loads(msg.value())
                device_id = data.get("device_id")
                topic     = msg.topic()
                if device_id and _connections[device_id]:
                    envelope = json.dumps({"topic": topic, "data": data})
                    await broadcast(device_id, envelope)
            except Exception as e:
                log.error("WS broadcast error: %s", e)
    finally:
        consumer.close()


_kafka_task: asyncio.Task | None = None


def ensure_kafka_task():
    global _kafka_task
    if _kafka_task is None or _kafka_task.done():
        _kafka_task = asyncio.create_task(kafka_reader())


@router.websocket("/api/ws/{device_id}")
async def websocket_endpoint(websocket: WebSocket, device_id: str):
    await websocket.accept()
    ensure_kafka_task()
    _connections[device_id].add(websocket)
    log.info("WS client connected for device %s", device_id)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                ensure_kafka_task()
                await websocket.send_text('{"type":"ping"}')
    except WebSocketDisconnect:
        pass
    finally:
        _connections[device_id].discard(websocket)
        log.info("WS client disconnected from device %s", device_id)

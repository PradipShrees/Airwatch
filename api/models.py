from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from api.database import Base


class User(Base):
    __tablename__ = "users"

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True)
    email:         Mapped[str]      = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str]      = mapped_column(String(255), nullable=False)
    is_admin:      Mapped[bool]     = mapped_column(Boolean, default=False)
    created_at:    Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    latitude:      Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude:     Mapped[float | None] = mapped_column(Float, nullable=True)
    location_name: Mapped[str | None]   = mapped_column(String(128), nullable=True)

    owned_devices:   Mapped[list["Ownership"]]              = relationship(back_populates="user")
    alert_rules:     Mapped[list["AlertRule"]]              = relationship(back_populates="user")
    notif_prefs:     Mapped[list["NotificationPreference"]] = relationship(back_populates="user")


class DeviceRegistry(Base):
    __tablename__ = "device_registry"

    device_id:      Mapped[str]      = mapped_column(String(64), primary_key=True)
    auth_code:      Mapped[str]      = mapped_column(String(64), nullable=False)
    created_at:     Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    provisioned_by: Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), nullable=True)


class Ownership(Base):
    __tablename__ = "ownership"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True)
    device_id:  Mapped[str]      = mapped_column(String(64), ForeignKey("device_registry.device_id"))
    user_id:    Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"))
    nickname:   Mapped[str]      = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="owned_devices")


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True)
    device_id:   Mapped[str]      = mapped_column(String(64), index=True)
    timestamp:   Mapped[datetime] = mapped_column(DateTime, index=True)
    pm1:         Mapped[float]    = mapped_column(Float, nullable=True)
    pm25:        Mapped[float]    = mapped_column(Float, nullable=True)
    pm4:         Mapped[float]    = mapped_column(Float, nullable=True)
    pm10:        Mapped[float]    = mapped_column(Float, nullable=True)
    temperature: Mapped[float]    = mapped_column(Float, nullable=True)
    humidity:    Mapped[float]    = mapped_column(Float, nullable=True)
    voc:         Mapped[float]    = mapped_column(Float, nullable=True)


class AQIResult(Base):
    __tablename__ = "aqi_results"

    id:                 Mapped[int]      = mapped_column(Integer, primary_key=True)
    device_id:          Mapped[str]      = mapped_column(String(64), index=True)
    timestamp:          Mapped[datetime] = mapped_column(DateTime, index=True)
    aqi:                Mapped[int]      = mapped_column(Integer)
    category:           Mapped[str]      = mapped_column(String(64))
    dominant_pollutant: Mapped[str]      = mapped_column(String(32), nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id:        Mapped[int]      = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str]      = mapped_column(String(64), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    type:      Mapped[str]      = mapped_column(String(64))
    message:   Mapped[str]      = mapped_column(Text)
    threshold: Mapped[float]    = mapped_column(Float)
    value:     Mapped[float]    = mapped_column(Float)
    resolved:  Mapped[bool]     = mapped_column(Boolean, default=False)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id:        Mapped[int]      = mapped_column(Integer, primary_key=True)
    user_id:   Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"))
    device_id: Mapped[str]      = mapped_column(String(64), ForeignKey("device_registry.device_id"))
    metric:    Mapped[str]      = mapped_column(String(32))   # pm25, pm10, voc, temperature, humidity, aqi
    operator:  Mapped[str]      = mapped_column(String(4))    # gt | lt
    threshold: Mapped[float]    = mapped_column(Float)
    enabled:   Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="alert_rules")


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id:                   Mapped[int]      = mapped_column(Integer, primary_key=True)
    user_id:              Mapped[int]      = mapped_column(Integer, ForeignKey("users.id"), unique=True)
    email_alerts:         Mapped[bool]     = mapped_column(Boolean, default=True)
    quiet_hours_start:    Mapped[int]      = mapped_column(Integer, nullable=True)  # 0-23
    quiet_hours_end:      Mapped[int]      = mapped_column(Integer, nullable=True)
    min_interval_minutes: Mapped[int]      = mapped_column(Integer, default=60)

    user: Mapped["User"] = relationship(back_populates="notif_prefs")

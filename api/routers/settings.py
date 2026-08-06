import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from api.database import get_db
from api.models import User, Ownership, DeviceRegistry, NotificationPreference
from api.auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])


# ── Profile ───────────────────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    email: EmailStr


class PasswordUpdate(BaseModel):
    current_password: str
    new_password:     str


class ProfileOut(BaseModel):
    id:       int
    email:    str
    is_admin: bool


@router.put("/profile", response_model=ProfileOut)
async def update_profile(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email, User.id != current_user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already in use")
    current_user.email = body.email
    await db.commit()
    await db.refresh(current_user)
    return ProfileOut(id=current_user.id, email=current_user.email, is_admin=current_user.is_admin)


@router.put("/password")
async def change_password(
    body: PasswordUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not bcrypt.checkpw(body.current_password.encode(), current_user.password_hash.encode()):
        raise HTTPException(400, "Current password is incorrect")
    current_user.password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    return {"detail": "Password updated"}


# ── Devices ───────────────────────────────────────────────────────────────────

class DeviceDetail(BaseModel):
    device_id: str
    nickname:  str | None
    auth_code: str
    added_at:  str


@router.get("/devices", response_model=list[DeviceDetail])
async def list_devices_detail(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(Ownership, DeviceRegistry)
        .join(DeviceRegistry, Ownership.device_id == DeviceRegistry.device_id)
        .where(Ownership.user_id == current_user.id)
    )
    return [
        DeviceDetail(
            device_id=o.device_id,
            nickname=o.nickname,
            auth_code=reg.auth_code,
            added_at=o.created_at.isoformat(),
        )
        for o, reg in r.all()
    ]


class RenameDevice(BaseModel):
    nickname: str


@router.put("/devices/{device_id}", response_model=DeviceDetail)
async def rename_device(
    device_id: str,
    body: RenameDevice,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(Ownership).where(Ownership.device_id == device_id, Ownership.user_id == current_user.id)
    )
    ownership = r.scalar_one_or_none()
    if not ownership:
        raise HTTPException(404, "Device not found")
    reg = await db.get(DeviceRegistry, device_id)
    ownership.nickname = body.nickname
    await db.commit()
    return DeviceDetail(
        device_id=device_id, nickname=body.nickname,
        auth_code=reg.auth_code, added_at=ownership.created_at.isoformat(),
    )


# ── Location ──────────────────────────────────────────────────────────────────

class LocationOut(BaseModel):
    latitude:      float | None = None
    longitude:     float | None = None
    location_name: str   | None = None


class LocationIn(BaseModel):
    latitude:      float | None = None
    longitude:     float | None = None
    location_name: str   | None = None


@router.get("/location", response_model=LocationOut)
async def get_location(current_user: User = Depends(get_current_user)):
    return LocationOut(
        latitude=current_user.latitude,
        longitude=current_user.longitude,
        location_name=current_user.location_name,
    )


@router.put("/location", response_model=LocationOut)
async def update_location(
    body: LocationIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.latitude      = body.latitude
    current_user.longitude     = body.longitude
    current_user.location_name = body.location_name
    await db.commit()
    return LocationOut(
        latitude=body.latitude, longitude=body.longitude, location_name=body.location_name,
    )


# ── Notifications ─────────────────────────────────────────────────────────────

class NotifPrefsOut(BaseModel):
    email_alerts:         bool
    quiet_hours_start:    int | None
    quiet_hours_end:      int | None
    min_interval_minutes: int


class NotifPrefsIn(BaseModel):
    email_alerts:         bool = True
    quiet_hours_start:    int | None = None
    quiet_hours_end:      int | None = None
    min_interval_minutes: int = 60


@router.get("/notifications", response_model=NotifPrefsOut)
async def get_notif_prefs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
    )
    pref = r.scalar_one_or_none()
    if not pref:
        return NotifPrefsOut(email_alerts=True, quiet_hours_start=None, quiet_hours_end=None, min_interval_minutes=60)
    return pref


@router.put("/notifications", response_model=NotifPrefsOut)
async def update_notif_prefs(
    body: NotifPrefsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    r = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == current_user.id)
    )
    pref = r.scalar_one_or_none()
    if not pref:
        pref = NotificationPreference(user_id=current_user.id)
        db.add(pref)
    pref.email_alerts         = body.email_alerts
    pref.quiet_hours_start    = body.quiet_hours_start
    pref.quiet_hours_end      = body.quiet_hours_end
    pref.min_interval_minutes = body.min_interval_minutes
    await db.commit()
    await db.refresh(pref)
    return pref

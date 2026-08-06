import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from api.database import get_db
from api.models import DeviceRegistry, Ownership, User
from api.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/devices", tags=["devices"])


class AddDeviceRequest(BaseModel):
    device_id: str
    auth_code: str
    nickname:  str | None = None


class DeviceResponse(BaseModel):
    device_id: str
    nickname:  str | None


class ProvisionRequest(BaseModel):
    device_id: str


class ProvisionResponse(BaseModel):
    device_id: str
    auth_code: str


@router.get("", response_model=list[DeviceResponse])
async def list_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ownership).where(Ownership.user_id == current_user.id)
    )
    rows = result.scalars().all()
    return [DeviceResponse(device_id=r.device_id, nickname=r.nickname) for r in rows]


@router.post("", response_model=DeviceResponse)
async def add_device(
    body: AddDeviceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify device exists in registry with correct auth_code
    reg = await db.get(DeviceRegistry, body.device_id)
    if not reg or reg.auth_code != body.auth_code:
        raise HTTPException(status_code=400, detail="Invalid device_id or auth_code")

    # Check not already owned by this user
    existing = await db.execute(
        select(Ownership).where(
            Ownership.device_id == body.device_id,
            Ownership.user_id   == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Device already added to your account")

    ownership = Ownership(
        device_id=body.device_id,
        user_id=current_user.id,
        nickname=body.nickname or body.device_id,
    )
    db.add(ownership)
    await db.commit()
    return DeviceResponse(device_id=ownership.device_id, nickname=ownership.nickname)


@router.delete("/{device_id}", status_code=204)
async def remove_device(
    device_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Ownership).where(
            Ownership.device_id == device_id,
            Ownership.user_id   == current_user.id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(row)
    await db.commit()


# Admin-only: provision a new device
@router.post("/admin/provision", response_model=ProvisionResponse)
async def provision_device(
    body: ProvisionRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.get(DeviceRegistry, body.device_id)
    if existing:
        raise HTTPException(status_code=400, detail="Device already provisioned")

    auth_code = secrets.token_hex(8).upper()
    reg = DeviceRegistry(
        device_id=body.device_id,
        auth_code=auth_code,
        provisioned_by=admin.id,
    )
    db.add(reg)
    await db.commit()
    return ProvisionResponse(device_id=body.device_id, auth_code=auth_code)

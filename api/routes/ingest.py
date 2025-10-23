"""
FastAPI endpoints for raw Health Connect record ingestion with MongoDB deduplication.
Handles both standard Health Connect records and special accelerometer chunks from Wear OS.
"""

import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne

from config import settings
from .login import verify_token

# ---------- FastAPI router ----------
router = APIRouter()

# ---------- Mongo client ----------
client = AsyncIOMotorClient(settings.MONGO_URI)
db = client[settings.MONGO_DB]

# ---------- Models ----------
class Envelope(BaseModel):
    data: Union[Dict[str, Any], List[Dict[str, Any]]] = Field(...)

class AccelSample(BaseModel):
    # Either provide absolute timestamp `ts` OR an offset `tOffsetMs` relative to `startedAt`.
    ts: Optional[datetime] = None
    tOffsetMs: Optional[int] = None
    x: float
    y: float
    z: float

class AccelChunk(BaseModel):
    deviceId: str
    sampleRateHz: float
    startedAt: datetime
    samples: List[AccelSample]
    deviceModel: Optional[str] = None
    platform: Optional[str] = "wear-os"

# ---------- Utilities ----------

def collection_for(record_type: str):
    """Get MongoDB collection for a record type."""
    safe = record_type.strip().lower().replace(" ", "_")
    return db[f"hc_{safe}"]

def dedupe_key(doc: Dict[str, Any], fallback_fields: Optional[List[str]] = None) -> str:
    """Generate deduplication key for a document."""
    # Prefer Health Connect metadata.id when available
    md = doc.get("metadata") or {}
    md_id = md.get("id") or doc.get("id") or None
    if md_id:
        return str(md_id)
    # Otherwise hash a few stable fields
    fields = fallback_fields or ["startTime", "endTime", "type"]
    parts = [str(doc.get(f, "")) for f in fields]
    parts.append(str(doc))  # include body as last resort
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

async def ensure_core_indexes():
    """Ensure required indexes exist for core record types."""
    core_types = [
        "HeartRate",
        "SleepSession", 
        "Speed",
        "Steps",
        "Distance",
        "ActiveCaloriesBurned",
        "TotalCaloriesBurned",
    ]
    for t in core_types:
        coll = collection_for(t)
        # Unique by user + metadata.id when present
        await coll.create_index([("userId", 1), ("metadata.id", 1)], unique=True, sparse=True)
        await coll.create_index([("userId", 1), ("startTime", 1)])
        await coll.create_index([("userId", 1), ("endTime", 1)])

    acc = db["imu_accelerometer_chunks"]
    # One doc per chunk; unique by user+device+windowStart to avoid duplicates
    await acc.create_index([("userId", 1), ("deviceId", 1), ("windowStart", 1)], unique=True)
    await acc.create_index([("userId", 1), ("windowEnd", 1)])

# ---------- Ingest endpoints ----------

@router.post("/{record_type}")
async def ingest_generic(
    record_type: str, 
    payload: Envelope, 
    user_id: str = Depends(verify_token)
):
    """
    Ingest Health Connect records with deduplication.
    
    Special case for IMU accelerometer chunks:
    - When record_type == "Accelerometer", expects chunked sensor data
    - Otherwise handles standard Health Connect records
    
    Args:
        record_type: Type of health record (e.g., "HeartRate", "Steps", "Accelerometer")
        payload: Envelope containing data (object or array)
        user_id: Authenticated user ID from JWT token
    
    Returns:
        Dict with ingestion results (matched, modified, upserts counts)
    """
    # Special case for IMU accelerometer chunks
    if record_type.strip().lower() == "accelerometer":
        return await ingest_accelerometer(payload.data, user_id)

    # Normalize to list for bulk upsert
    items: List[Dict[str, Any]]
    if isinstance(payload.data, dict):
        items = [payload.data]
    else:
        items = payload.data

    coll = collection_for(record_type)
    now = datetime.now(timezone.utc)

    ops: List[UpdateOne] = []
    for doc in items:
        # Attach envelope/context
        doc = dict(doc)  # copy to mutate safely
        doc.setdefault("type", record_type)
        doc["userId"] = user_id
        doc["ingestedAt"] = now

        key = dedupe_key(doc)
        doc["_dedupe"] = key

        # Upsert: match by (userId, type, metadata.id) OR fallback _dedupe hash
        filter_q: Dict[str, Any] = {
            "userId": user_id,
            "type": record_type,
            "$or": [
                {"metadata.id": doc.get("metadata", {}).get("id")},
                {"_dedupe": key},
            ],
        }
        ops.append(UpdateOne(filter_q, {"$set": doc}, upsert=True))

    if not ops:
        return {"ok": True, "matched": 0, "modified": 0, "upserts": 0}

    result = await coll.bulk_write(ops, ordered=False)
    return {
        "ok": True,
        "matched": result.matched_count,
        "modified": result.modified_count,
        "upserts": result.upserted_count,
    }

# ---------- Accelerometer (chunked) ----------

async def ingest_accelerometer(raw: Union[Dict[str, Any], List[Dict[str, Any]]], user_id: str):
    """
    Ingest accelerometer chunks from Wear OS devices.
    
    Args:
        raw: Single chunk dict or list of chunk dicts
        user_id: Authenticated user ID
    
    Returns:
        Dict with ingestion results
    """
    # Accept single chunk or list of chunks
    chunks: List[AccelChunk]
    if isinstance(raw, dict):
        chunks = [AccelChunk(**raw)]
    else:
        chunks = [AccelChunk(**c) for c in raw]

    now = datetime.now(timezone.utc)
    coll = db["imu_accelerometer_chunks"]

    docs: List[Dict[str, Any]] = []
    for ch in chunks:
        # Build expanded timestamps and compute window
        samples_ts: List[List[Union[str, float]]] = []  # [[tsISO, x, y, z], ...]
        window_start = ch.startedAt.replace(tzinfo=timezone.utc)
        window_end = window_start

        for s in ch.samples:
            if s.ts is not None:
                ts = s.ts if s.ts.tzinfo else s.ts.replace(tzinfo=timezone.utc)
            elif s.tOffsetMs is not None:
                ts = window_start + timedelta(milliseconds=int(s.tOffsetMs))
            else:
                raise HTTPException(status_code=400, detail="Each sample requires either ts or tOffsetMs")

            if ts > window_end:
                window_end = ts

            samples_ts.append([ts.isoformat(), float(s.x), float(s.y), float(s.z)])

        doc = {
            "userId": user_id,
            "deviceId": ch.deviceId,
            "sampleRateHz": float(ch.sampleRateHz),
            "windowStart": window_start,
            "windowEnd": window_end,
            "n": len(samples_ts),
            "samples": samples_ts,
            "tags": {"deviceModel": ch.deviceModel, "platform": ch.platform},
            "ingestedAt": now,
        }

        # Dedupe key per chunk (user+device+windowStart)
        doc["_dedupe"] = hashlib.sha256(
            f"{user_id}|{ch.deviceId}|{window_start.isoformat()}".encode("utf-8")
        ).hexdigest()

        docs.append(doc)

    # Upsert chunks by unique user+device+windowStart
    ops = []
    for d in docs:
        ops.append(
            UpdateOne(
                {"userId": d["userId"], "deviceId": d["deviceId"], "windowStart": d["windowStart"]},
                {"$set": d},
                upsert=True,
            )
        )

    if not ops:
        return {"ok": True, "inserted": 0, "upserts": 0}

    result = await coll.bulk_write(ops, ordered=False)
    return {"ok": True, "upserts": result.upserted_count, "modified": result.modified_count}

# ---------- Health checks ----------

@router.get("/health")
async def health():
    """
    Simple health check endpoint.
    
    Returns:
        Dict with status if MongoDB is reachable
    """
    try:
        await db.command("ping")
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------- Startup event ----------
@router.on_event("startup")
async def _on_startup():
    """Ensure indexes are created on startup."""
    await ensure_core_indexes()

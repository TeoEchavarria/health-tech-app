"""
Shared validation utilities for Health Connect record types.
Centralizes validation logic used across sync and ingest endpoints.
"""

from fastapi import HTTPException
from typing import List

# Canonical Health Connect record types
# Must match the canonical list in app/src/types/recordTypes.js
VALID_HEALTH_CONNECT_TYPES: List[str] = [
    "activeCaloriesBurned",
    "basalBodyTemperature",
    "basalMetabolicRate",
    "bloodGlucose",
    "bloodPressure",
    "bodyFat",
    "bodyTemperature",
    "boneMass",
    "cervicalMucus",
    "distance",
    "exerciseSession",
    "elevationGained",
    "floorsClimbed",
    "heartRate",
    "height",
    "hydration",
    "leanBodyMass",
    "menstruationFlow",
    "menstruationPeriod",
    "nutrition",
    "ovulationTest",
    "oxygenSaturation",
    "power",
    "respiratoryRate",
    "restingHeartRate",
    "sleepSession",
    "speed",
    "steps",
    "stepsCadence",
    "totalCaloriesBurned",
    "vo2Max",
    "weight",
    "wheelchairPushes",
]

# Special sensor types (non-Health Connect)
# These are device-specific sensor streams (e.g., Wear OS IMU data)
VALID_SENSOR_TYPES: List[str] = [
    "accelerometer",  # IMU accelerometer chunks from Wear OS
    "gyroscope",      # IMU gyroscope chunks (future support)
]

# Combined list of all valid record types
VALID_RECORD_TYPES: List[str] = VALID_HEALTH_CONNECT_TYPES + VALID_SENSOR_TYPES


def validate_record_type(record_type: str, allow_sensors: bool = False) -> str:
    """
    Validate that the record type is in the canonical allow-list.
    
    Accepts both camelCase (canonical) and PascalCase (Health Connect format).
    Returns the camelCase version.
    
    Args:
        record_type: The record type to validate
        allow_sensors: If True, allows special sensor types (accelerometer, etc.)
                      If False, only allows standard Health Connect types
    
    Returns:
        str: Normalized camelCase record type
    
    Raises:
        HTTPException: If record type is not in the allow-list
    """
    if not record_type:
        raise HTTPException(
            status_code=400,
            detail="Record type cannot be empty"
        )
    
    # Convert to camelCase if it's PascalCase
    camel_case = record_type[0].lower() + record_type[1:] if record_type else record_type
    
    # Determine which list to check
    if allow_sensors:
        valid_types = VALID_RECORD_TYPES
        type_category = "Health Connect or sensor"
    else:
        valid_types = VALID_HEALTH_CONNECT_TYPES
        type_category = "Health Connect"
    
    if camel_case not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid record type: '{record_type}'. "
                   f"Must be a valid {type_category} type. "
                   f"Valid types: {', '.join(valid_types)}"
        )
    
    return camel_case


def is_sensor_type(record_type: str) -> bool:
    """
    Check if a record type is a special sensor type (not Health Connect).
    
    Args:
        record_type: The record type to check (camelCase)
    
    Returns:
        bool: True if it's a sensor type, False if it's Health Connect
    """
    return record_type.lower() in [t.lower() for t in VALID_SENSOR_TYPES]


def get_collection_name(record_type: str, is_sync_endpoint: bool = False) -> str:
    """
    Get the MongoDB collection name for a record type.
    
    Args:
        record_type: The validated record type (camelCase)
        is_sync_endpoint: If True, uses sync naming (no prefix)
                         If False, uses ingest naming (hc_ prefix)
    
    Returns:
        str: Collection name for MongoDB
    """
    # Sensor types use special collection names
    if is_sensor_type(record_type):
        if record_type == "accelerometer":
            return "imu_accelerometer_chunks"
        elif record_type == "gyroscope":
            return "imu_gyroscope_chunks"
        else:
            # Generic sensor collection
            return f"imu_{record_type}_chunks"
    
    # Health Connect types
    if is_sync_endpoint:
        # Sync uses direct camelCase names
        return record_type
    else:
        # Ingest uses hc_ prefix with lowercase
        safe = record_type.strip().lower().replace(" ", "_")
        return f"hc_{safe}"


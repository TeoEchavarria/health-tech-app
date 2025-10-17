"""
Health Data Aggregators
Handles aggregation, outlier removal, and data cleaning for health records
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from collections import defaultdict
import statistics


# Data category definitions
CATEGORY_1_CUMULATIVE_SUM = {
    "distance", "activeCaloriesBurned", "totalCaloriesBurned",
    "floorsClimbed", "elevationGained", "hydration", "wheelchairPushes"
}

CATEGORY_1_CUMULATIVE_MAX = {
    "steps"
}

CATEGORY_2_INSTANTANEOUS = {
    "weight", "height", "bodyFat", "leanBodyMass", "boneMass",
    "vo2Max", "basalMetabolicRate", "restingHeartRate"
}

CATEGORY_3_HOURLY = {
    "heartRate", "oxygenSaturation", "power",
    "stepsCadence", "respiratoryRate"
}

CATEGORY_4_MEDICAL = {
    "bloodPressure", "bloodGlucose", "bodyTemperature", "basalBodyTemperature"
}

CATEGORY_5_SESSIONS = {
    "sleepSession", "exerciseSession"
}

CATEGORY_6_REPRODUCTIVE = {
    "menstruationFlow", "menstruationPeriod", "ovulationTest",
    "cervicalMucus", "nutrition"
}


def clean_outliers(values: List[float], remove_zeros: bool = True) -> List[float]:
    """
    Remove outliers from a list of numeric values using IQR method.
    Also removes zeros and null values by default.
    
    Args:
        values: List of numeric values
        remove_zeros: Whether to remove zero values (default: True)
    
    Returns:
        List of cleaned values
    """
    if not values:
        return []
    
    # Remove None values
    cleaned = [v for v in values if v is not None]
    
    # Remove zeros if requested
    if remove_zeros:
        cleaned = [v for v in cleaned if v != 0]
    
    if len(cleaned) < 4:  # Need at least 4 values for IQR
        return cleaned
    
    # Calculate quartiles
    sorted_values = sorted(cleaned)
    n = len(sorted_values)
    q1_idx = n // 4
    q3_idx = (3 * n) // 4
    
    q1 = sorted_values[q1_idx]
    q3 = sorted_values[q3_idx]
    iqr = q3 - q1
    
    # Define bounds
    lower_bound = q1 - (1.5 * iqr)
    upper_bound = q3 + (1.5 * iqr)
    
    # Filter outliers
    return [v for v in cleaned if lower_bound <= v <= upper_bound]


def extract_value_from_record(record: Dict[str, Any], record_type: str) -> Optional[float]:
    """
    Extract numeric value from a health record based on its type.
    
    Args:
        record: The health record
        record_type: Type of the record
    
    Returns:
        Numeric value or None
    """
    data = record.get('data', {})
    
    # Common extraction patterns
    value_fields = ['count', 'value', 'beatsPerMinute', 'percentage']
    nested_fields = [
        'weight.kilograms', 'weight.inKilograms',  # Both formats for weight
        'distance.meters', 'distance.inMeters',
        'energy.kilocalories', 'energy.inKilocalories',
        'volume.liters', 'volume.inLiters',
        'height.meters', 'height.inMeters',
        'mass.kilograms', 'mass.inKilograms'
    ]
    
    # Try direct fields first
    for field in value_fields:
        if field in data:
            val = data[field]
            if isinstance(val, (int, float)):
                return float(val)
    
    # Try nested fields
    for nested in nested_fields:
        parts = nested.split('.')
        current = data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                current = None
                break
        if current is not None and isinstance(current, (int, float)):
            return float(current)
    
    # Try samples array
    if 'samples' in data and isinstance(data['samples'], list):
        samples = data['samples']
        if samples:
            first_sample = samples[0]
            if isinstance(first_sample, dict):
                for field in value_fields:
                    if field in first_sample:
                        val = first_sample[field]
                        if isinstance(val, (int, float)):
                            return float(val)
    
    return None


def get_hour_from_timestamp(timestamp: str) -> int:
    """Extract hour (0-23) from ISO timestamp."""
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        return dt.hour
    except Exception:
        return 0


def get_date_from_timestamp(timestamp: str) -> str:
    """Extract date (YYYY-MM-DD) from ISO timestamp."""
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return datetime.now(timezone.utc).strftime('%Y-%m-%d')


def aggregate_category_1_cumulative(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate cumulative metrics (steps, distance, calories, etc.)
    Returns total for the day.
    """
    values = []
    origins = set()
    
    for record in records:
        val = extract_value_from_record(record, record_type)
        if val is not None:
            values.append(val)
        
        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)
    
    # For cumulative metrics, sum all values (after cleaning zeros)
    # Don't remove zeros for hydration, calories, etc.
    remove_zeros = record_type in ['wheelchairPushes']
    cleaned = clean_outliers(values, remove_zeros=remove_zeros)

    total = sum(cleaned) if cleaned else 0
    
    return {
        "aggregate": {
            "total": total,
            "recordCount": len(cleaned)
        },
        "dataOrigins": list(origins)
    }


def aggregate_category_1_cumulative_max(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate cumulative metrics where we want the maximum value (steps, etc.)
    Returns the maximum value for the day (representing the final cumulative total).
    """
    values = []
    origins = set()

    for record in records:
        val = extract_value_from_record(record, record_type)
        if val is not None:
            values.append(val)

        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)

    # For cumulative max metrics, take the maximum value after cleaning
    cleaned = clean_outliers(values, remove_zeros=True)
    maximum = max(cleaned) if cleaned else 0

    return {
        "aggregate": {
            "total": maximum,
            "recordCount": len(cleaned)
        },
        "dataOrigins": list(origins)
    }


def aggregate_category_2_instantaneous(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate instantaneous metrics (weight, height, body fat, etc.)
    Returns latest value or average for the day.
    """
    measurements = []
    origins = set()
    
    for record in records:
        val = extract_value_from_record(record, record_type)
        timestamp = record.get('start') or record.get('time')
        
        if val is not None and timestamp:
            measurements.append({
                'value': val,
                'timestamp': timestamp
            })
        
        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)
    
    if not measurements:
        return {
            "aggregate": {"value": None},
            "dataOrigins": list(origins)
        }
    
    # Get latest measurement
    latest = max(measurements, key=lambda x: x['timestamp'])
    
    # Also calculate daily average
    values = [m['value'] for m in measurements]
    cleaned = clean_outliers(values, remove_zeros=True)
    avg = statistics.mean(cleaned) if cleaned else latest['value']
    
    return {
        "aggregate": {
            "value": latest['value'],
            "timestamp": latest['timestamp'],
            "dailyAverage": avg,
            "recordCount": len(measurements)
        },
        "dataOrigins": list(origins)
    }


def aggregate_category_3_hourly(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate metrics with hourly granularity (heart rate, oxygen saturation, etc.)
    Returns hourly summaries plus daily aggregate.
    """
    hourly_data = defaultdict(list)
    origins = set()
    all_values = []
    
    for record in records:
        timestamp = record.get('start') or record.get('time')
        if not timestamp:
            continue
        
        hour = get_hour_from_timestamp(timestamp)
        
        # Extract value (might be in samples)
        data = record.get('data', {})
        
        # Handle samples array (for heart rate, etc.)
        if 'samples' in data and isinstance(data['samples'], list):
            for sample in data['samples']:
                val = None
                if isinstance(sample, dict):
                    for field in ['beatsPerMinute', 'value', 'percentage']:
                        if field in sample:
                            val = sample[field]
                            break
                if val is not None:
                    hourly_data[hour].append(float(val))
                    all_values.append(float(val))
        else:
            # Single value record
            val = extract_value_from_record(record, record_type)
            if val is not None:
                hourly_data[hour].append(val)
                all_values.append(val)
        
        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)
    
    # Process hourly summaries
    hourly_summaries = []
    for hour in range(24):
        if hour in hourly_data:
            values = hourly_data[hour]
            cleaned = clean_outliers(values, remove_zeros=True)
            
            if cleaned:
                hourly_summaries.append({
                    "hour": hour,
                    "avg": statistics.mean(cleaned),
                    "min": min(cleaned),
                    "max": max(cleaned),
                    "samples": len(cleaned)
                })
    
    # Calculate daily aggregate
    cleaned_all = clean_outliers(all_values, remove_zeros=True)
    daily_aggregate = {}
    if cleaned_all:
        daily_aggregate = {
            "dailyAvg": statistics.mean(cleaned_all),
            "dailyMin": min(cleaned_all),
            "dailyMax": max(cleaned_all),
            "totalSamples": len(cleaned_all)
        }
    
    return {
        "aggregate": daily_aggregate,
        "hourly": hourly_summaries,
        "dataOrigins": list(origins)
    }


def aggregate_category_4_medical(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate medical measurements (blood pressure, glucose, temperature, etc.)
    Keeps all individual measurements.
    """
    measurements = []
    origins = set()
    
    for record in records:
        timestamp = record.get('start') or record.get('time')
        data = record.get('data', {})
        
        if timestamp:
            measurement = {
                "timestamp": timestamp,
                "data": data
            }
            
            # Special handling for blood pressure
            if record_type == "bloodPressure":
                systolic = None
                diastolic = None
                
                if 'systolic' in data:
                    sys_data = data['systolic']
                    if isinstance(sys_data, dict):
                        systolic = sys_data.get('millimetersOfMercury')
                    else:
                        systolic = sys_data
                
                if 'diastolic' in data:
                    dias_data = data['diastolic']
                    if isinstance(dias_data, dict):
                        diastolic = dias_data.get('millimetersOfMercury')
                    else:
                        diastolic = dias_data
                
                measurement['systolic'] = systolic
                measurement['diastolic'] = diastolic
            
            measurements.append(measurement)
        
        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)
    
    return {
        "measurements": measurements,
        "dataOrigins": list(origins)
    }


def aggregate_category_5_sessions(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate session records (sleep, exercise)
    Keeps all sessions with their details.
    """
    sessions = []
    origins = set()
    
    for record in records:
        start = record.get('start')
        end = record.get('end')
        data = record.get('data', {})
        
        if start and end:
            session = {
                "start": start,
                "end": end,
                "data": data
            }
            
            # Calculate duration in minutes
            try:
                start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
                duration_minutes = (end_dt - start_dt).total_seconds() / 60
                session['durationMinutes'] = duration_minutes
            except Exception:
                pass
            
            sessions.append(session)
        
        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)
    
    # Calculate total duration
    total_duration = sum(s.get('durationMinutes', 0) for s in sessions)
    
    return {
        "sessions": sessions,
        "aggregate": {
            "totalSessions": len(sessions),
            "totalDurationMinutes": total_duration
        },
        "dataOrigins": list(origins)
    }


def aggregate_category_6_reproductive(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Aggregate reproductive health data
    Keeps all entries with their details.
    """
    entries = []
    origins = set()
    
    for record in records:
        timestamp = record.get('start') or record.get('time')
        data = record.get('data', {})
        
        if timestamp:
            entries.append({
                "timestamp": timestamp,
                "data": data
            })
        
        app = record.get('app', {})
        if isinstance(app, dict):
            pkg = app.get('packageName', '')
            if pkg:
                origins.add(pkg)
        elif isinstance(app, str):
            origins.add(app)
    
    return {
        "entries": entries,
        "dataOrigins": list(origins)
    }


def aggregate_records(records: List[Dict[str, Any]], record_type: str) -> Dict[str, Any]:
    """
    Main aggregation function. Routes to appropriate aggregator based on record type.
    
    Args:
        records: List of individual health records
        record_type: Type of health record (camelCase)
    
    Returns:
        Aggregated data structure
    """
    if not records:
        return {}
    
    # Determine category and aggregate
    if record_type in CATEGORY_1_CUMULATIVE_SUM:
        return aggregate_category_1_cumulative(records, record_type)
    elif record_type in CATEGORY_1_CUMULATIVE_MAX:
        return aggregate_category_1_cumulative_max(records, record_type)
    elif record_type in CATEGORY_2_INSTANTANEOUS:
        return aggregate_category_2_instantaneous(records, record_type)
    elif record_type in CATEGORY_3_HOURLY:
        return aggregate_category_3_hourly(records, record_type)
    elif record_type in CATEGORY_4_MEDICAL:
        return aggregate_category_4_medical(records, record_type)
    elif record_type in CATEGORY_5_SESSIONS:
        return aggregate_category_5_sessions(records, record_type)
    elif record_type in CATEGORY_6_REPRODUCTIVE:
        return aggregate_category_6_reproductive(records, record_type)
    else:
        # Default: treat as instantaneous
        return aggregate_category_2_instantaneous(records, record_type)


def group_records_by_date(records: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Group records by date (YYYY-MM-DD).
    
    Args:
        records: List of health records
    
    Returns:
        Dictionary mapping dates to lists of records
    """
    grouped = defaultdict(list)
    
    for record in records:
        timestamp = record.get('start') or record.get('time')
        if timestamp:
            date = get_date_from_timestamp(timestamp)
            grouped[date].append(record)
    
    return dict(grouped)


// Utility to normalize health records into chart-friendly data points
// Extracts numeric values from various Health Connect record formats

/**
 * Helper to try multiple possible value paths in a record object
 * @param {Object} record - The health record object
 * @param {Array<string>} paths - Array of dot-notation paths to try
 * @returns {*} The first found value or undefined
 */
function tryPaths(record, ...paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let value = record;
    
    for (const part of parts) {
      // Handle array access like "samples[0]"
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        if (value && Object.prototype.hasOwnProperty.call(value, key)) {
          value = value[key];
          if (Array.isArray(value) && value.length > parseInt(index)) {
            value = value[parseInt(index)];
          } else {
            value = undefined;
            break;
          }
        } else {
          value = undefined;
          break;
        }
      } else {
        if (value && Object.prototype.hasOwnProperty.call(value, part)) {
          value = value[part];
        } else {
          value = undefined;
          break;
        }
      }
    }
    
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  
  return undefined;
}

/**
 * Check if a record is in the new aggregated format
 * @param {Object} record - The health record object
 * @returns {boolean} True if aggregated format
 */
function isAggregatedRecord(record) {
  return record && (
    record.hasOwnProperty('aggregate') ||
    record.hasOwnProperty('hourly') ||
    record.hasOwnProperty('measurements') ||
    record.hasOwnProperty('sessions') ||
    record.hasOwnProperty('entries')
  );
}

/**
 * Extract value from aggregated record
 * @param {string} recordType - The type of health record
 * @param {Object} record - The aggregated health record object
 * @returns {number|Object|null} The normalized value(s) or null
 */
function normalizeAggregatedRecord(recordType, record) {
  if (!record) return null;

  // Category 1: Cumulative (has aggregate.total)
  if (record.aggregate && record.aggregate.total !== undefined) {
    return record.aggregate.total;
  }

  // Category 2: Instantaneous (has aggregate.value)
  if (record.aggregate && record.aggregate.value !== undefined) {
    return record.aggregate.value;
  }

  // Category 3: Hourly (has aggregate.dailyAvg and hourly array)
  if (record.aggregate && record.aggregate.dailyAvg !== undefined) {
    return record.aggregate.dailyAvg;
  }

  // Category 4: Medical measurements (get latest)
  if (record.measurements && Array.isArray(record.measurements)) {
    if (record.measurements.length > 0) {
      const latest = record.measurements[record.measurements.length - 1];
      
      // Special handling for blood pressure
      if (recordType === 'BloodPressure' || recordType === 'bloodPressure') {
        return {
          systolic: latest.systolic || null,
          diastolic: latest.diastolic || null
        };
      }
      
      // Generic measurement value
      return latest.data?.value || null;
    }
    return null;
  }

  // Category 5: Sessions (get total duration)
  if (record.sessions && Array.isArray(record.sessions)) {
    if (record.aggregate && record.aggregate.totalDurationMinutes !== undefined) {
      return record.aggregate.totalDurationMinutes;
    }
    return null;
  }

  // Category 6: Reproductive (count entries)
  if (record.entries && Array.isArray(record.entries)) {
    return record.entries.length;
  }

  return null;
}

/**
 * Normalize a health record to extract its numeric value(s)
 * Handles both legacy individual records and new aggregated records
 * @param {string} recordType - The type of health record
 * @param {Object} record - The health record object
 * @returns {number|Object|null} The normalized value(s) or null
 */
export function normalizeRecordValue(recordType, record) {
  if (!record) return null;
  
  // Check if it's an aggregated record (new format)
  if (isAggregatedRecord(record)) {
    return normalizeAggregatedRecord(recordType, record);
  }
  
  // Legacy format handling
  switch (recordType) {
    case 'Vo2Max':
      return tryPaths(record, 'vo2MillilitersPerMinuteKilogram', 'vo2Max', 'value', 'samples.0.value');
    
    case 'RestingHeartRate':
      return tryPaths(record, 'beatsPerMinute', 'heartRate', 'value', 'samples.0.value');
    
    case 'HeartRate':
      // Heart rate can be single value or samples array
      const hrSamples = record.samples;
      if (Array.isArray(hrSamples) && hrSamples.length > 0) {
        // Average all samples
        const sum = hrSamples.reduce((acc, s) => acc + (s.beatsPerMinute || s.value || 0), 0);
        return Math.round(sum / hrSamples.length);
      }
      return tryPaths(record, 'beatsPerMinute', 'heartRate', 'value');
    
    case 'BloodPressure':
      // Blood pressure has systolic and diastolic
      const systolic = tryPaths(record, 'systolic.millimetersOfMercury', 'systolic', 'value.systolic');
      const diastolic = tryPaths(record, 'diastolic.millimetersOfMercury', 'diastolic', 'value.diastolic');
      
      if (systolic !== undefined || diastolic !== undefined) {
        return {
          systolic: systolic || null,
          diastolic: diastolic || null
        };
      }
      return null;
    
    case 'BodyFat':
      return tryPaths(record, 'percentage.value', 'percentage', 'value');
    
    case 'LeanBodyMass':
      return tryPaths(record, 'mass.kilograms', 'mass', 'value');
    
    case 'Weight':
      return tryPaths(record, 'weight.kilograms', 'weight', 'mass.kilograms', 'mass', 'value');
    
    case 'Height':
      return tryPaths(record, 'height.meters', 'height', 'value');
    
    case 'RespiratoryRate':
      return tryPaths(record, 'rate', 'value', 'samples.0.value');
    
    case 'OxygenSaturation':
      return tryPaths(record, 'percentage.value', 'percentage', 'value');
    
    case 'BodyTemperature':
    case 'BasalBodyTemperature':
      return tryPaths(record, 'temperature.celsius', 'temperature', 'value');
    
    case 'BloodGlucose':
      return tryPaths(record, 'level.milligramsPerDeciliter', 'level', 'value');
    
    case 'SleepSession':
      // Calculate duration in minutes
      if (record.startTime && record.endTime) {
        const startMs = new Date(record.startTime).getTime();
        const endMs = new Date(record.endTime).getTime();
        const durationMinutes = (endMs - startMs) / 60000;
        return Math.round(durationMinutes * 10) / 10; // Round to 1 decimal
      }
      return null;
    
    case 'ExerciseSession':
      // Calculate duration in minutes
      if (record.startTime && record.endTime) {
        const startMs = new Date(record.startTime).getTime();
        const endMs = new Date(record.endTime).getTime();
        const durationMinutes = (endMs - startMs) / 60000;
        return Math.round(durationMinutes * 10) / 10;
      }
      return null;
    
    case 'Steps':
      return tryPaths(record, 'count', 'value');
    
    case 'Distance':
      return tryPaths(record, 'distance.meters', 'distance', 'value');
    
    case 'ActiveCaloriesBurned':
    case 'TotalCaloriesBurned':
      return tryPaths(record, 'energy.kilocalories', 'energy', 'value');
    
    case 'Hydration':
      return tryPaths(record, 'volume.liters', 'volume', 'value');
    
    case 'BasalMetabolicRate':
      return tryPaths(record, 'bmr', 'value');
    
    case 'FloorsClimbed':
      return tryPaths(record, 'floors', 'value');
    
    case 'ElevationGained':
      return tryPaths(record, 'elevation.meters', 'elevation', 'value');
    
    case 'Speed':
      // Speed can have samples
      const speedSamples = record.samples;
      if (Array.isArray(speedSamples) && speedSamples.length > 0) {
        // Average all samples
        const sum = speedSamples.reduce((acc, s) => {
          const speed = s.speed?.metersPerSecond || s.value || 0;
          return acc + speed;
        }, 0);
        return Math.round((sum / speedSamples.length) * 100) / 100;
      }
      return tryPaths(record, 'speed.metersPerSecond', 'speed', 'value');
    
    case 'Power':
      return tryPaths(record, 'power.watts', 'power', 'value', 'samples.0.value');
    
    case 'BoneMass':
      return tryPaths(record, 'mass.kilograms', 'mass', 'value');
    
    default:
      // Generic fallback: try common field names
      return tryPaths(record, 'value', 'samples.0.value', 'measurement', 'count');
  }
}

/**
 * Get hourly data from an aggregated record
 * @param {Object} record - The aggregated health record
 * @returns {Array|null} Array of hourly data points or null
 */
export function getHourlyData(record) {
  if (!record || !record.hourly || !Array.isArray(record.hourly)) {
    return null;
  }
  
  return record.hourly.map(hourData => ({
    hour: hourData.hour,
    avg: hourData.avg,
    min: hourData.min,
    max: hourData.max,
    samples: hourData.samples,
    x: `${hourData.hour}:00`,
    y: hourData.avg
  }));
}

/**
 * Get measurements from an aggregated record
 * @param {Object} record - The aggregated health record
 * @returns {Array|null} Array of measurements or null
 */
export function getMeasurements(record) {
  if (!record || !record.measurements || !Array.isArray(record.measurements)) {
    return null;
  }
  
  return record.measurements;
}

/**
 * Get sessions from an aggregated record
 * @param {Object} record - The aggregated health record
 * @returns {Array|null} Array of sessions or null
 */
export function getSessions(record) {
  if (!record || !record.sessions || !Array.isArray(record.sessions)) {
    return null;
  }
  
  return record.sessions;
}

/**
 * Convert a health record to a chart data point
 * Handles both aggregated and legacy formats
 * @param {string} recordType - The type of health record
 * @param {Object} record - The health record object
 * @param {string} xFormat - Format for x-axis ('time', 'date', 'datetime')
 * @returns {Object|null} Chart data point with x and y properties
 */
export function recordToChartPoint(recordType, record, xFormat = 'time') {
  if (!record) return null;
  
  const value = normalizeRecordValue(recordType, record);
  
  if (value === null || value === undefined) {
    return null;
  }
  
  // For aggregated records, use the date field
  let timestamp;
  if (isAggregatedRecord(record)) {
    timestamp = record.date ? new Date(record.date) : new Date();
  } else {
    timestamp = new Date(record.startTime || record.time);
  }
  
  // Determine x-axis label based on format
  let xLabel;
  
  switch (xFormat) {
    case 'time':
      xLabel = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      break;
    case 'date':
      xLabel = timestamp.toLocaleDateString();
      break;
    case 'datetime':
      xLabel = timestamp.toLocaleString();
      break;
    default:
      xLabel = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Handle special cases like Blood Pressure which has multiple values
  if ((recordType === 'BloodPressure' || recordType === 'bloodPressure') && value.systolic !== null) {
    return {
      x: xLabel,
      y: value.systolic,
      secondary: value.diastolic,
      timestamp: isAggregatedRecord(record) ? record.date : (record.startTime || record.time),
      hourly: getHourlyData(record)
    };
  }
  
  return {
    x: xLabel,
    y: typeof value === 'number' ? value : null,
    timestamp: isAggregatedRecord(record) ? record.date : (record.startTime || record.time),
    hourly: getHourlyData(record)
  };
}

/**
 * Convert array of records to chart data points
 * @param {string} recordType - The type of health records
 * @param {Array} records - Array of health records
 * @param {string} xFormat - Format for x-axis
 * @returns {Array} Array of chart data points
 */
export function recordsToChartData(recordType, records, xFormat = 'time') {
  if (!Array.isArray(records)) return [];
  
  return records
    .map(record => recordToChartPoint(recordType, record, xFormat))
    .filter(point => point !== null && point.y !== null);
}

/**
 * Get unit label for a record type
 */
export function getUnitLabel(recordType) {
  const units = {
    'Vo2Max': 'ml/kg/min',
    'RestingHeartRate': 'bpm',
    'HeartRate': 'bpm',
    'BloodPressure': 'mmHg',
    'BodyFat': '%',
    'LeanBodyMass': 'kg',
    'Weight': 'kg',
    'Height': 'm',
    'RespiratoryRate': 'breaths/min',
    'OxygenSaturation': '%',
    'BodyTemperature': '°C',
    'BasalBodyTemperature': '°C',
    'BloodGlucose': 'mg/dL',
    'SleepSession': 'min',
    'ExerciseSession': 'min',
    'Steps': 'steps',
    'Distance': 'm',
    'ActiveCaloriesBurned': 'kcal',
    'TotalCaloriesBurned': 'kcal',
    'Hydration': 'L',
    'BasalMetabolicRate': 'kcal/day',
    'FloorsClimbed': 'floors',
    'ElevationGained': 'm',
    'Speed': 'm/s',
    'Power': 'W',
    'BoneMass': 'kg'
  };
  
  return units[recordType] || '';
}


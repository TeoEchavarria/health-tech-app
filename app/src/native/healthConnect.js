// Wrapper for react-native-health-connect functions
// This creates a cleaner abstraction layer for the native module

import {
  initialize as hcInitialize,
  requestPermission as hcRequestPermission,
  readRecords as hcReadRecords,
  readRecord as hcReadRecord,
  insertRecords as hcInsertRecords,
  deleteRecordsByUuids as hcDeleteRecordsByUuids
} from 'react-native-health-connect';

/**
 * Initialize Health Connect
 */
export async function initialize() {
  return await hcInitialize();
}

/**
 * Request permissions for health data types
 */
export async function requestPermission(permissions) {
  return await hcRequestPermission(permissions);
}

/**
 * Read records for a specific type with filters
 */
export async function readRecords(recordType, options = {}) {
  return await hcReadRecords(recordType, options);
}

/**
 * Read a single record by ID
 */
export async function readRecord(recordType, recordId) {
  return await hcReadRecord(recordType, recordId);
}

/**
 * Insert records into Health Connect
 */
export async function insertRecords(records) {
  return await hcInsertRecords(records);
}

/**
 * Delete records by UUIDs
 */
export async function deleteRecordsByUuids(recordType, clientIds, uuids) {
  return await hcDeleteRecordsByUuids(recordType, clientIds, uuids);
}

/**
 * All available record types in Health Connect
 */
export const RECORD_TYPES = [
  "ActiveCaloriesBurned",
  "BasalBodyTemperature",
  "BloodGlucose",
  "BloodPressure",
  "BasalMetabolicRate",
  "BodyFat",
  "BodyTemperature",
  "BoneMass",
  "CyclingPedalingCadence",
  "CervicalMucus",
  "ExerciseSession",
  "Distance",
  "ElevationGained",
  "FloorsClimbed",
  "HeartRate",
  "Height",
  "Hydration",
  "LeanBodyMass",
  "MenstruationFlow",
  "MenstruationPeriod",
  "Nutrition",
  "OvulationTest",
  "OxygenSaturation",
  "Power",
  "RespiratoryRate",
  "RestingHeartRate",
  "SleepSession",
  "Speed",
  "Steps",
  "StepsCadence",
  "TotalCaloriesBurned",
  "Vo2Max",
  "Weight",
  "WheelchairPushes"
];

/**
 * Get all permission objects (read and write) for all record types
 */
export function getAllPermissions() {
  const permissions = [];
  
  RECORD_TYPES.forEach(recordType => {
    permissions.push(
      { accessType: 'read', recordType },
      { accessType: 'write', recordType }
    );
  });
  
  return permissions;
}


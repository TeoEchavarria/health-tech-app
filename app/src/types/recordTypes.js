// Canonical record types - Single source of truth for app & backend
// This list defines ALL valid Health Connect record types we support

export const RecordTypes = [
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
];

// Convert to React Native Health Connect format (PascalCase)
export const toHealthConnectFormat = (camelCaseType) => {
  return camelCaseType.charAt(0).toUpperCase() + camelCaseType.slice(1);
};

// Convert from React Native Health Connect format to canonical format
export const fromHealthConnectFormat = (pascalCaseType) => {
  return pascalCaseType.charAt(0).toLowerCase() + pascalCaseType.slice(1);
};

// Get all record types in Health Connect format (PascalCase)
export const getHealthConnectRecordTypes = () => {
  return RecordTypes.map(toHealthConnectFormat);
};

// Validate if a type is in the canonical list
export const isValidRecordType = (type) => {
  return RecordTypes.includes(type);
};

// Validate if a type is in Health Connect format
export const isValidHealthConnectType = (type) => {
  const canonical = fromHealthConnectFormat(type);
  return RecordTypes.includes(canonical);
};

// Granularity options for aggregated data
export const Granularity = {
  HOUR: "hour",
  DAY: "day",
};

// Aggregated payload structure
export const createAggregatedPayload = ({
  type,
  granularity,
  periodStart,
  periodEnd,
  data,
  metadata = {}
}) => {
  if (!isValidRecordType(type)) {
    throw new Error(`Invalid record type: ${type}. Must be one of: ${RecordTypes.join(', ')}`);
  }
  
  if (!Object.values(Granularity).includes(granularity)) {
    throw new Error(`Invalid granularity: ${granularity}. Must be 'hour' or 'day'`);
  }

  return {
    type,
    granularity,
    periodStart,
    periodEnd,
    data,
    metadata
  };
};

export default {
  RecordTypes,
  Granularity,
  toHealthConnectFormat,
  fromHealthConnectFormat,
  getHealthConnectRecordTypes,
  isValidRecordType,
  isValidHealthConnectType,
  createAggregatedPayload,
};


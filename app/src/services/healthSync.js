// Health data synchronization service
// Handles reading from Health Connect and syncing to server

import { apiClient } from './api';
import { logApiError } from '../utils/errorHandler';
import { 
  readRecords,
  readRecord,
  initialize, 
  RECORD_TYPES,
  getAllPermissions,
  checkPermissions,
  requestPermissionsIfNeeded 
} from '../native/healthConnect';
import { EventEmitter } from '../utils/eventBus';
import { isoStartOfToday, isoNow, isoDaysAgo } from '../utils/dateHelpers';
import { ingestRecords } from './ingestService';
import config from '../../config';

// NOTE: All record types are now sent in bulk to the backend
// The backend handles aggregation, outlier removal, and efficient storage with bulk operations
// No special handling needed - one request per record type with all records

// Configuration for endpoint routing (sync vs ingest)
const ENDPOINT_CONFIG = {
  HeartRate: { useIngest: config.ingest?.recordTypes?.HeartRate || false, enableRaw: true },
  Steps: { useIngest: config.ingest?.recordTypes?.Steps || false, enableRaw: true },
  Accelerometer: { useIngest: config.ingest?.recordTypes?.Accelerometer || false, enableRaw: true },
  Distance: { useIngest: config.ingest?.recordTypes?.Distance || false, enableRaw: false },
  SleepSession: { useIngest: config.ingest?.recordTypes?.SleepSession || false, enableRaw: false },
  ExerciseSession: { useIngest: config.ingest?.recordTypes?.ExerciseSession || false, enableRaw: false },
  // Add other record types as needed
};

/**
 * Determine which endpoint to use for a record type
 * @param {string} recordType - The record type
 * @returns {Object} Endpoint configuration
 */
function getEndpointConfig(recordType) {
  return ENDPOINT_CONFIG[recordType] || { useIngest: false, enableRaw: false };
}

/**
 * Sync records using the appropriate endpoint (sync or ingest)
 * @param {string} recordType - Type of record
 * @param {Array} records - Records to sync
 * @param {boolean} parallelMode - If true, send to both endpoints
 * @returns {Promise<Object>} Sync result
 */
async function syncRecordsToEndpoint(recordType, records, parallelMode = false) {
  const endpointConfig = getEndpointConfig(recordType);
  const results = {};

  // Send to ingest endpoint if configured
  if (endpointConfig.useIngest || parallelMode) {
    try {
      console.log(`📤 Syncing ${recordType} to /ingest/: ${records.length} records`);
      results.ingest = await ingestRecords(recordType, records);
      console.log(`✅ Ingest sync completed: ${results.ingest.upserts} upserts, ${results.ingest.modified} modified`);
    } catch (error) {
      console.error(`❌ Ingest sync failed for ${recordType}:`, error);
      logApiError(error, { recordType, operation: 'ingestSync', recordCount: records.length });
      results.ingest = { error: error.message };
    }
  }

  // Send to sync endpoint if not using ingest or in parallel mode
  if (!endpointConfig.useIngest || parallelMode) {
    try {
      console.log(`📤 Syncing ${recordType} to /sync/: ${records.length} records`);
      const response = await apiClient.post(`/sync/${recordType}`, { data: records });
      results.sync = response.data;
      console.log(`✅ Sync endpoint completed for ${recordType}`);
    } catch (error) {
      console.error(`❌ Sync endpoint failed for ${recordType}:`, error);
      logApiError(error, { recordType, operation: 'syncEndpoint', recordCount: records.length });
      results.sync = { error: error.message };
    }
  }

  return results;
}

/**
 * Ensure read permissions are granted before fetching data
 * @returns {Promise<boolean>} True if all read permissions are granted
 */
export async function ensureReadPermissions() {
  try {
    await initialize();
    
    // Get only read permissions (not write)
    const allPermissions = getAllPermissions();
    const readPermissions = allPermissions.filter(p => p.accessType === 'read');
    
    const { allGranted, missing } = await checkPermissions(readPermissions);
    
    if (!allGranted) {
      console.log(`⚠️ Missing ${missing.length} read permissions, requesting...`);
      const result = await requestPermissionsIfNeeded(readPermissions);
      
      if (!result.success) {
        console.error('❌ Failed to obtain read permissions');
        return false;
      }
      
      console.log('✅ All read permissions granted');
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring read permissions:', error);
    return false;
  }
}

/**
 * Fetch a single record by ID
 * @param {string} recordType - The type of health record to fetch
 * @param {string} recordId - The unique ID of the record
 * @returns {Promise<Array>} Array with single record or empty array
 */
export async function fetchRecordById(recordType, recordId) {
  try {
    await initialize();
    
    console.log(`📖 Fetching single record: ${recordType} with ID ${recordId}`);
    const record = await readRecord(recordType, recordId);
    
    return record ? [record] : [];
  } catch (error) {
    console.error(`Error fetching record by ID for ${recordType}:`, error);
    return [];
  }
}

/**
 * Fetch records for a specific type within a time range
 * @param {string} recordType - The type of health record to fetch
 * @param {Object} options - Options for fetching
 * @param {string} options.startTime - ISO string for start time
 * @param {string} options.endTime - ISO string for end time
 * @returns {Promise<Array>} Array of health records
 */
export async function fetchRecordsForType(recordType, { startTime = isoStartOfToday(), endTime = isoNow() } = {}) {
  try {
    await initialize();
    
    console.log(`📖 Fetching ${recordType} from ${startTime} to ${endTime}`);
    
    const result = await readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime,
        endTime
      }
    });
    
    const records = result.records || [];
    
    if (records.length === 0) {
      console.log(`⚠️ No records found for ${recordType} in the specified time range`);
    } else {
      console.log(`✅ Found ${records.length} records for ${recordType}`);
    }
    
    return records;
  } catch (error) {
    console.error(`Error fetching records for ${recordType}:`, error);
    return [];
  }
}

/**
 * Fetch the latest record for a specific type (no time limit)
 * Searches from now backwards to find the most recent record
 * @param {string} recordType - The type of health record to fetch
 * @param {Object} options - Options for fetching
 * @param {string} options.id - Optional record ID for fetching a specific record
 * @returns {Promise<Array>} Array with the latest record, or empty array
 */
export async function fetchLatestRecordForType(recordType, { id } = {}) {
  try {
    await initialize();
    
    // If ID is provided, fetch that specific record
    if (id) {
      console.log(`📖 Fetching specific record ${recordType} with ID ${id}`);
      return await fetchRecordById(recordType, id);
    }
    
    // Search backwards from now - Health Connect will return records sorted by time
    // We go back far enough to find any historical data
    const veryOldDate = new Date('2020-01-01').toISOString(); // Start from 2020 or earlier
    const now = isoNow();
    
    console.log(`📖 Fetching latest ${recordType} record (searching from 2020)`);
    
    const result = await readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: veryOldDate,
        endTime: now
      }
    });
    
    const records = result.records || [];
    
    // If we have records, return only the most recent one
    if (records.length > 0) {
      // Sort by time to ensure we get the latest (most recent first)
      const sorted = records.sort((a, b) => {
        // For session-based records (Sleep, Exercise), use endTime to get the most recent completion
        const timeA = new Date(
          (recordType === 'SleepSession' || recordType === 'ExerciseSession') 
            ? (a.endTime || a.startTime || a.time)
            : (a.startTime || a.time)
        ).getTime();
        const timeB = new Date(
          (recordType === 'SleepSession' || recordType === 'ExerciseSession') 
            ? (b.endTime || b.startTime || b.time)
            : (b.startTime || b.time)
        ).getTime();
        return timeB - timeA; // Descending order (newest first)
      });
      
      console.log(`✅ Found latest ${recordType} record from ${sorted[0].startTime || sorted[0].time}`);
      return [sorted[0]]; // Return as array for consistency
    }
    
    console.log(`⚠️ No historical records found for ${recordType}`);
    return [];
  } catch (error) {
    console.error(`Error fetching latest record for ${recordType}:`, error);
    return [];
  }
}

/**
 * Fetch today's records for specific types
 * @param {Array<string>} types - Array of record types to fetch
 * @returns {Promise<Object>} Object mapping record types to their records
 */
export async function fetchTodayForTypes(types) {
  const startTime = isoStartOfToday();
  const endTime = isoNow();
  
  const results = {};
  
  await Promise.all(
    types.map(async (type) => {
      try {
        const records = await fetchRecordsForType(type, { startTime, endTime });
        results[type] = records;
      } catch (error) {
        console.error(`Error fetching today's data for ${type}:`, error);
        results[type] = [];
      }
    })
  );
  
  return results;
}

/**
 * Sync all health data to server
 * @param {Object} options - Sync options
 * @param {string} options.startTime - Optional custom start time
 * @param {string} options.endTime - Optional custom end time
 * @param {string} options.authToken - Authentication token
 * @param {function} options.onProgress - Progress callback
 * @param {boolean} options.skipPermissionCheck - Skip permission check (default: false)
 * @returns {Promise<Object>} Sync result with total count
 */
export async function syncAll({
  startTime,
  endTime,
  authToken,
  onProgress,
  skipPermissionCheck = false
} = {}) {
  try {
    await initialize();
    
    // Check permissions before syncing (unless explicitly skipped)
    if (!skipPermissionCheck) {
      const allPermissions = getAllPermissions();
      const { allGranted, missing } = await checkPermissions(allPermissions);
      
      if (!allGranted) {
        const error = new Error(
          `Missing ${missing.length} permissions. Please grant all permissions before syncing.`
        );
        error.missingPermissions = missing;
        throw error;
      }
      
      console.log('✅ All permissions verified, starting sync...');
    }
    
    const currentTime = isoNow();
    const from = startTime || isoDaysAgo(29); // Default to last 29 days
    const to = endTime || currentTime;
    
    // Set auth header if provided
    if (authToken) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    }
    
    let totalRecords = 0;
    let syncedRecords = 0;
    
    // First pass: count total records
    const recordCounts = {};
    for (const type of RECORD_TYPES) {
      try {
        const result = await readRecords(type, {
          timeRangeFilter: {
            operator: 'between',
            startTime: from,
            endTime: to
          }
        });
        
        const records = result.records || [];
        recordCounts[type] = records;
        totalRecords += records.length;
      } catch (error) {
        console.error(`Error reading ${type}:`, error);
        recordCounts[type] = [];
      }
    }
    
    // Emit initial progress
    if (onProgress) {
      onProgress({ current: 0, total: totalRecords, phase: 'syncing' });
    }
    
    // Second pass: sync to server
    // Route to appropriate endpoint (sync or ingest) based on configuration
    const parallelMode = config.migration?.parallelMode || false;
    
    for (const type of RECORD_TYPES) {
      const records = recordCounts[type];
      
      if (!records || records.length === 0) {
        continue;
      }
      
      // Send ALL records for this type using appropriate endpoint(s)
      try {
        console.log(`📤 Syncing ${type}: ${records.length} records`);
        
        const results = await syncRecordsToEndpoint(type, records, parallelMode);
        
        // Count successful records (prefer ingest results if available)
        if (results.ingest && !results.ingest.error) {
          syncedRecords += records.length;
        } else if (results.sync && !results.sync.error) {
          syncedRecords += records.length;
        }
        
        // Log results for migration testing
        if (config.migration?.testMode) {
          console.log(`📊 ${type} sync results:`, results);
        }
        
        // Emit progress update
        if (onProgress) {
          onProgress({
            current: syncedRecords,
            total: totalRecords,
            phase: 'syncing',
            currentType: type,
            results: results // Include results for debugging
          });
        }
        
        console.log(`✅ Successfully synced ${records.length} ${type} records`);
      } catch (error) {
        console.error(`❌ Error syncing ${type}:`, error);
        logApiError(error, { recordType: type, operation: 'syncAll', recordCount: records.length });
        // Continue with next type even if this one fails
      }
    }
    
    // Emit completion event
    const result = {
      timestamp: isoNow(),
      total: syncedRecords,
      requested: totalRecords
    };
    
    EventEmitter.emit('SYNC_COMPLETED', result);
    
    if (onProgress) {
      onProgress({
        current: syncedRecords,
        total: totalRecords,
        phase: 'completed'
      });
    }
    
    return result;
  } catch (error) {
    console.error('Sync error:', error);
    EventEmitter.emit('SYNC_ERROR', { error: error.message });
    throw error;
  }
}

/**
 * Sync specific record types only
 * @param {Array<string>} types - Array of record types to sync
 * @param {Object} options - Same as syncAll options
 */
export async function syncSpecificTypes(types, options = {}) {
  try {
    await initialize();
    
    const { startTime, endTime, authToken, onProgress } = options;
    const parallelMode = config.migration?.parallelMode || false;
    
    const currentTime = isoNow();
    const from = startTime || isoDaysAgo(29);
    const to = endTime || currentTime;
    
    if (authToken) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    }
    
    let totalRecords = 0;
    let syncedRecords = 0;
    
    for (const type of types) {
      try {
        const records = await fetchRecordsForType(type, {
          startTime: from,
          endTime: to
        });
        
        totalRecords += records.length;
        
        if (records.length === 0) continue;
        
        // Send ALL records using appropriate endpoint(s)
        console.log(`📤 Syncing ${type}: ${records.length} records`);
        
        const results = await syncRecordsToEndpoint(type, records, parallelMode);
        
        // Count successful records
        if (results.ingest && !results.ingest.error) {
          syncedRecords += records.length;
        } else if (results.sync && !results.sync.error) {
          syncedRecords += records.length;
        }
        
        if (onProgress) {
          onProgress({ current: syncedRecords, total: totalRecords });
        }
        
        console.log(`✅ Successfully synced ${records.length} ${type} records`);
      } catch (error) {
        console.error(`❌ Error processing ${type}:`, error);
        logApiError(error, { recordType: type, operation: 'syncSpecificTypes', recordCount: records.length });
      }
    }
    
    const result = { timestamp: isoNow(), total: syncedRecords };
    EventEmitter.emit('SYNC_COMPLETED', result);
    
    return result;
  } catch (error) {
    console.error('Specific sync error:', error);
    throw error;
  }
}

/**
 * Get sync statistics
 */
export function getSyncStats() {
  const ingestEnabled = config.ingest?.enabled || false;
  const ingestTypes = Object.entries(config.ingest?.recordTypes || {})
    .filter(([_, enabled]) => enabled)
    .map(([type, _]) => type);
  
  return {
    totalTypes: RECORD_TYPES.length,
    allTypes: RECORD_TYPES,
    syncMode: 'bulk',  // All types use bulk sync now
    ingestEnabled,
    ingestTypes,
    endpointConfig: ENDPOINT_CONFIG,
    migrationMode: config.migration?.parallelMode || false
  };
}


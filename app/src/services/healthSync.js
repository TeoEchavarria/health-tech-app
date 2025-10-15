// Health data synchronization service
// Handles reading from Health Connect and syncing to server

import { apiClient } from './api';
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

// NOTE: All record types are now sent in bulk to the backend
// The backend handles aggregation, outlier removal, and efficient storage with bulk operations
// No special handling needed - one request per record type with all records

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
        const timeA = new Date(a.startTime || a.time).getTime();
        const timeB = new Date(b.startTime || b.time).getTime();
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
    // All types are now sent in bulk - backend handles aggregation efficiently
    for (const type of RECORD_TYPES) {
      const records = recordCounts[type];
      
      if (!records || records.length === 0) {
        continue;
      }
      
      // Send ALL records for this type in ONE request
      try {
        console.log(`📤 Syncing ${type}: ${records.length} records in ONE bulk request`);
        
        await apiClient.post(`/sync/${type}`, {
          data: records  // Send all records at once
        });
        
        syncedRecords += records.length;
        
        // Emit progress update
        if (onProgress) {
          onProgress({
            current: syncedRecords,
            total: totalRecords,
            phase: 'syncing',
            currentType: type
          });
        }
        
        console.log(`✅ Successfully synced ${records.length} ${type} records`);
      } catch (error) {
        console.error(`❌ Error bulk syncing ${type}:`, error);
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
        
        // Send ALL records in ONE bulk request
        console.log(`📤 Syncing ${type}: ${records.length} records in ONE bulk request`);
        
        await apiClient.post(`/sync/${type}`, { data: records });
        syncedRecords += records.length;
        
        if (onProgress) {
          onProgress({ current: syncedRecords, total: totalRecords });
        }
        
        console.log(`✅ Successfully synced ${records.length} ${type} records`);
      } catch (error) {
        console.error(`❌ Error processing ${type}:`, error);
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
  return {
    totalTypes: RECORD_TYPES.length,
    allTypes: RECORD_TYPES,
    syncMode: 'bulk'  // All types use bulk sync now
  };
}


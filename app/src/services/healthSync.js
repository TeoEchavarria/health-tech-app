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
import { sleep } from '../utils/sleep';
import { isoStartOfToday, isoNow, isoDaysAgo } from '../utils/dateHelpers';

// Record types that require special handling (one-by-one posting with delay)
const SPECIAL_TYPES = new Set(['SleepSession', 'Speed', 'HeartRate']);

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
    
    const result = await readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime,
        endTime
      }
    });
    
    return result.records || [];
  } catch (error) {
    console.error(`Error fetching records for ${recordType}:`, error);
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
    for (const type of RECORD_TYPES) {
      const records = recordCounts[type];
      
      if (!records || records.length === 0) {
        continue;
      }
      
      // Special handling for certain types (one-by-one with delay)
      if (SPECIAL_TYPES.has(type)) {
        for (let j = 0; j < records.length; j++) {
          try {
            // Read full record with detailed data
            const fullRecord = await readRecord(type, records[j].metadata.id);
            
            // Post to server
            await apiClient.post(`/sync/${type}`, {
              data: fullRecord
            });
            
            syncedRecords++;
            
            // Emit progress update
            if (onProgress) {
              onProgress({
                current: syncedRecords,
                total: totalRecords,
                phase: 'syncing',
                currentType: type
              });
            }
            
            // Delay between requests to be server-friendly (preserve original behavior)
            if (j < records.length - 1) {
              await sleep(3000);
            }
          } catch (error) {
            console.error(`Error syncing ${type} record:`, error);
            // Continue with next record even if this one fails
          }
        }
      } else {
        // Bulk post for other types
        try {
          await apiClient.post(`/sync/${type}`, {
            data: records
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
        } catch (error) {
          console.error(`Error bulk syncing ${type}:`, error);
          // Continue with next type even if this one fails
        }
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
        
        if (SPECIAL_TYPES.has(type)) {
          // One-by-one for special types
          for (const record of records) {
            try {
              const fullRecord = await readRecord(type, record.metadata.id);
              await apiClient.post(`/sync/${type}`, { data: fullRecord });
              syncedRecords++;
              
              if (onProgress) {
                onProgress({ current: syncedRecords, total: totalRecords });
              }
              
              await sleep(3000);
            } catch (error) {
              console.error(`Error syncing ${type}:`, error);
            }
          }
        } else {
          // Bulk post
          await apiClient.post(`/sync/${type}`, { data: records });
          syncedRecords += records.length;
          
          if (onProgress) {
            onProgress({ current: syncedRecords, total: totalRecords });
          }
        }
      } catch (error) {
        console.error(`Error processing ${type}:`, error);
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
    specialTypes: Array.from(SPECIAL_TYPES),
    allTypes: RECORD_TYPES
  };
}


/**
 * Generic service for ingesting records to the new /ingest/{record_type} endpoints
 * Provides raw data storage with deduplication support
 */

import { apiClient } from './api';
import { apiCall } from '../utils/apiWrapper';

/**
 * Ingest records to raw storage endpoint
 * @param {string} recordType - Type of record (HeartRate, Steps, Accelerometer, etc.)
 * @param {Object|Array} data - Single record or array of records
 * @returns {Promise<{ok: boolean, upserts: number, modified: number, matched: number}>}
 */
export async function ingestRecords(recordType, data) {
  return apiCall(
    async () => {
      console.log(`📤 Ingesting ${recordType}: ${Array.isArray(data) ? data.length : 1} record(s)`);
      
      const response = await apiClient.post(`/ingest/${recordType}`, { data });
      
      const result = response.data;
      console.log(`✅ ${recordType} ingested: ${result.upserts} upserts, ${result.modified} modified`);
      
      return result;
    },
    {
      operation: 'ingestRecords',
      endpoint: `/ingest/${recordType}`,
      method: 'POST',
      recordType,
      recordCount: Array.isArray(data) ? data.length : 1,
      showToast: false,
    }
  );
}

/**
 * Ingest accelerometer chunks specifically
 * @param {Object} chunkData - Accelerometer chunk with device info and samples
 * @returns {Promise<{ok: boolean, upserts: number, modified: number}>}
 */
export async function ingestAccelerometerChunk(chunkData) {
  return await ingestRecords('Accelerometer', chunkData);
}

/**
 * Batch ingest multiple record types in sequence
 * @param {Object} recordsByType - Object mapping record types to data arrays
 * @returns {Promise<Object>} Results for each record type
 */
export async function batchIngest(recordsByType) {
  const results = {};
  
  for (const [recordType, data] of Object.entries(recordsByType)) {
    if (data && (Array.isArray(data) ? data.length > 0 : true)) {
      try {
        results[recordType] = await ingestRecords(recordType, data);
      } catch (error) {
        console.error(`Failed to ingest ${recordType}:`, error);
        results[recordType] = { error: error.message };
      }
    }
  }
  
  return results;
}

/**
 * Test connectivity to ingest endpoints
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testIngestHealth() {
  return apiCall(
    async () => {
      const response = await apiClient.get('/ingest/health');
      return {
        ok: response.data.status === 'ok',
        message: response.data.status === 'ok' ? 'Ingest endpoints healthy' : 'Ingest endpoints unhealthy'
      };
    },
    {
      operation: 'testIngestHealth',
      endpoint: '/ingest/health',
      method: 'GET',
      showToast: false,
    }
  );
}

/**
 * Get ingest endpoint statistics (for debugging/monitoring)
 * @param {string} recordType - Optional record type to filter by
 * @returns {Promise<Object>} Statistics about ingest operations
 */
export async function getIngestStats(recordType = null) {
  try {
    // This would be a custom endpoint if you want to add it to the backend
    // For now, just return basic info
    const health = await testIngestHealth();
    return {
      endpoint: health.ok ? 'available' : 'unavailable',
      recordType: recordType || 'all',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      endpoint: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Validate record data before ingestion
 * @param {string} recordType - Type of record
 * @param {Object|Array} data - Record data to validate
 * @returns {Object} Validation result
 */
export function validateIngestData(recordType, data) {
  const errors = [];
  const warnings = [];
  
  if (!recordType || typeof recordType !== 'string') {
    errors.push('Record type must be a non-empty string');
  }
  
  if (!data) {
    errors.push('Data is required');
  } else if (Array.isArray(data)) {
    if (data.length === 0) {
      warnings.push('Empty array provided');
    }
    // Check each record in array
    data.forEach((record, index) => {
      if (!record || typeof record !== 'object') {
        errors.push(`Record at index ${index} must be an object`);
      }
    });
  } else if (typeof data !== 'object') {
    errors.push('Data must be an object or array of objects');
  }
  
  // Special validation for accelerometer data
  if (recordType.toLowerCase() === 'accelerometer') {
    if (!Array.isArray(data)) {
      data = [data]; // Normalize to array for validation
    }
    
    data.forEach((chunk, index) => {
      if (!chunk.deviceId) {
        errors.push(`Accelerometer chunk ${index} missing deviceId`);
      }
      if (!chunk.samples || !Array.isArray(chunk.samples)) {
        errors.push(`Accelerometer chunk ${index} missing samples array`);
      }
      if (!chunk.startedAt) {
        errors.push(`Accelerometer chunk ${index} missing startedAt`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

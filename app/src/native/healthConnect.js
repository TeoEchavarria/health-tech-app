// Wrapper for react-native-health-connect functions
// This creates a cleaner abstraction layer for the native module

import {
  initialize as hcInitialize,
  requestPermission as hcRequestPermission,
  getGrantedPermissions as hcGetGrantedPermissions,
  readRecords as hcReadRecords,
  readRecord as hcReadRecord,
  insertRecords as hcInsertRecords,
  deleteRecordsByUuids as hcDeleteRecordsByUuids,
  getSdkStatus,
  SdkAvailabilityStatus
} from 'react-native-health-connect';
import { Linking } from 'react-native';
import { getHealthConnectRecordTypes } from '../types/recordTypes';

/**
 * Check if Health Connect is available on the device
 * @returns {Promise<{available: boolean, status: string}>}
 */
export async function isHealthConnectAvailable() {
  try {
    const status = await getSdkStatus();
    return {
      available: status === SdkAvailabilityStatus.SDK_AVAILABLE,
      status: status
    };
  } catch (error) {
    console.error('Error checking Health Connect availability:', error);
    return { available: false, status: 'ERROR' };
  }
}

/**
 * Open Health Connect install page in Play Store
 */
export function openHealthConnectInstallPage() {
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';
  Linking.openURL(playStoreUrl).catch(err => {
    console.error('Failed to open Play Store:', err);
  });
}

/**
 * Initialize Health Connect
 */
export async function initialize() {
  return await hcInitialize();
}

/**
 * Get currently granted permissions
 * @returns {Promise<Array>} Array of granted permission objects
 */
export async function getGrantedPermissions() {
  try {
    return await hcGetGrantedPermissions();
  } catch (error) {
    console.error('Error getting granted permissions:', error);
    return [];
  }
}

/**
 * Check if specific permissions are granted
 * @param {Array} permissions - Array of permission objects to check
 * @returns {Promise<{allGranted: boolean, granted: Array, missing: Array}>}
 */
export async function checkPermissions(permissions) {
  try {
    const grantedPerms = await hcGetGrantedPermissions();
    
    // Create a set of granted permission strings for easy lookup
    const grantedSet = new Set(
      grantedPerms.map(p => `${p.accessType}:${p.recordType}`)
    );
    
    const granted = [];
    const missing = [];
    
    permissions.forEach(perm => {
      const key = `${perm.accessType}:${perm.recordType}`;
      if (grantedSet.has(key)) {
        granted.push(perm);
      } else {
        missing.push(perm);
      }
    });
    
    return {
      allGranted: missing.length === 0,
      granted,
      missing
    };
  } catch (error) {
    console.error('Error checking permissions:', error);
    return { allGranted: false, granted: [], missing: permissions };
  }
}

/**
 * Request permissions for health data types
 * This will only show the permission dialog if permissions are not already granted
 */
export async function requestPermission(permissions) {
  return await hcRequestPermission(permissions);
}

/**
 * Request permissions only if they're not already granted
 * @param {Array} permissions - Array of permission objects to request
 * @returns {Promise<{success: boolean, granted: Array, alreadyGranted: boolean}>}
 */
export async function requestPermissionsIfNeeded(permissions) {
  try {
    // First check what's already granted
    const { allGranted, missing } = await checkPermissions(permissions);
    
    if (allGranted) {
      console.log('✅ All permissions already granted');
      return {
        success: true,
        granted: permissions,
        alreadyGranted: true
      };
    }
    
    console.log(`⚠️ Missing ${missing.length} permissions, requesting...`);
    
    // Request the missing permissions
    const grantedPermissions = await hcRequestPermission(permissions);
    
    return {
      success: grantedPermissions.length === permissions.length,
      granted: grantedPermissions,
      alreadyGranted: false
    };
  } catch (error) {
    console.error('❌ Error requesting permissions:', error);
    throw error;
  }
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
 * All available record types in Health Connect (PascalCase format)
 * This list is derived from the canonical recordTypes.js contract
 */
export const RECORD_TYPES = getHealthConnectRecordTypes();

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


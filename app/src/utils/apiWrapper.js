/**
 * API wrapper with enhanced error handling and logging
 * Provides automatic error classification, retry logic, and user notifications
 */

import { ApiError, logApiError } from './errorHandler';
import Toast from 'react-native-toast-message';
import config from '../../config';

/**
 * Enhanced API call wrapper with automatic error handling
 * @param {Function} fn - The API function to call
 * @param {Object} context - Context information for logging and error handling
 * @returns {Promise} The API response or throws ApiError
 */
export async function apiCall(fn, context = {}) {
  const startTime = Date.now();
  
  try {
    const result = await fn();
    
    // Log exitoso (opcional, solo en debug mode)
    if (config.debug) {
      console.log(`✅ [${Date.now() - startTime}ms] ${context.operation || 'API call'} succeeded`);
    }
    
    return result;
  } catch (error) {
    const apiError = new ApiError(error, {
      ...context,
      duration: Date.now() - startTime
    });
    
    // Log detallado del error
    logApiError(apiError, context);
    
    // Mostrar notificación al usuario si está habilitado
    if (context.showToast !== false) {
      showUserNotification(apiError);
    }
    
    throw apiError;
  }
}

/**
 * Show user-friendly notification based on error type
 * @param {ApiError} apiError - The classified API error
 */
function showUserNotification(apiError) {
  const { title, description } = apiError.userMessage;
  
  Toast.show({
    type: apiError.userMessage.severity === 'warning' ? 'warning' : 'error',
    text1: title,
    text2: description,
    position: 'top',
    visibilityTime: apiError.type === 'NETWORK' ? 6000 : 4000,
    autoHide: true,
  });
}

/**
 * Retry logic for specific error types
 * @param {Function} fn - The function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} The result of the function call
 */
export async function apiCallWithRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    retryOn = ['NETWORK', 'TIMEOUT', 'SERVER'],
    context = {}
  } = options;
  
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall(fn, { ...context, attempt, maxRetries });
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error type
      if (!retryOn.includes(error.type) || attempt === maxRetries) {
        throw error;
      }
      
      console.log(`🔄 Retry attempt ${attempt}/${maxRetries} for ${error.type} error`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
    }
  }
  
  throw lastError;
}

/**
 * Batch API calls with individual error handling
 * @param {Array} calls - Array of {fn, context} objects
 * @param {Object} options - Batch options
 * @returns {Promise<Array>} Array of results and errors
 */
export async function batchApiCalls(calls, options = {}) {
  const {
    continueOnError = true,
    showToast = false,
    context = {}
  } = options;
  
  const results = [];
  const errors = [];
  
  for (let i = 0; i < calls.length; i++) {
    const { fn, context: callContext } = calls[i];
    
    try {
      const result = await apiCall(fn, {
        ...context,
        ...callContext,
        showToast,
        batchIndex: i,
        batchTotal: calls.length
      });
      results.push({ success: true, data: result, index: i });
    } catch (error) {
      const errorResult = { success: false, error, index: i };
      results.push(errorResult);
      errors.push(errorResult);
      
      if (!continueOnError) {
        throw error;
      }
    }
  }
  
  // Log batch results
  console.log(`📊 Batch API calls completed: ${results.length - errors.length} success, ${errors.length} failed`);
  
  return { results, errors, successCount: results.length - errors.length, errorCount: errors.length };
}

/**
 * Health check wrapper with specific error handling
 * @param {Function} healthCheckFn - The health check function
 * @param {Object} context - Context for the health check
 * @returns {Promise<Object>} Health check result
 */
export async function healthCheck(healthCheckFn, context = {}) {
  try {
    const result = await apiCall(healthCheckFn, {
      ...context,
      operation: 'healthCheck',
      showToast: false
    });
    
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.type,
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Sync operation wrapper with progress tracking
 * @param {Function} syncFn - The sync function
 * @param {Object} context - Context for the sync operation
 * @returns {Promise<Object>} Sync result with progress info
 */
export async function syncOperation(syncFn, context = {}) {
  const startTime = Date.now();
  
  try {
    console.log(`🔄 Starting sync operation: ${context.operation || 'unknown'}`);
    
    const result = await apiCall(syncFn, {
      ...context,
      showToast: false
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Sync operation completed in ${duration}ms`);
    
    return {
      success: true,
      data: result,
      duration,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Sync operation failed after ${duration}ms: ${error.type}`);
    
    return {
      success: false,
      error: error.type,
      message: error.message,
      duration,
      timestamp: new Date().toISOString()
    };
  }
}

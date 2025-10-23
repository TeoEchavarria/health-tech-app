// API client for communicating with the backend server
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../../config';
import { apiCall } from '../utils/apiWrapper';

// Create axios instance with base configuration
export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  }
});

// Token refresh state management
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

/**
 * Get stored tokens from AsyncStorage
 */
async function getStoredTokens() {
  try {
    const accessToken = await AsyncStorage.getItem('login');
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Error reading tokens from storage:', error);
    return { accessToken: null, refreshToken: null };
  }
}

/**
 * Save tokens to AsyncStorage
 */
async function saveTokens(accessToken, refreshToken) {
  try {
    if (accessToken) await AsyncStorage.setItem('login', accessToken);
    if (refreshToken) await AsyncStorage.setItem('refreshToken', refreshToken);
  } catch (error) {
    console.error('Error saving tokens to storage:', error);
  }
}

/**
 * Clear tokens from AsyncStorage
 */
async function clearTokens() {
  try {
    await AsyncStorage.removeItem('login');
    await AsyncStorage.removeItem('refreshToken');
  } catch (error) {
    console.error('Error clearing tokens:', error);
  }
}

/**
 * Set the authentication token for all requests
 * @deprecated Use interceptor instead - kept for backward compatibility
 */
export function setAuthToken(token) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

// ============================================
// REQUEST INTERCEPTOR - Inject Bearer Token
// ============================================
apiClient.interceptors.request.use(
  async (config) => {
    // Skip token injection for login/refresh endpoints
    if (config.url?.includes('/login') || config.url?.includes('/refresh')) {
      return config;
    }

    const { accessToken } = await getStoredTokens();
    if (accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Set up session from login response
 * Normalizes token field names and saves to storage
 */
export async function setAuthFromLogin(loginResponse) {
  // Backend returns { token, refresh } - normalize to accessToken/refreshToken
  const accessToken = loginResponse.token || loginResponse.access;
  const refreshToken = loginResponse.refresh || loginResponse.refreshToken;
  
  if (!accessToken || !refreshToken) {
    throw new Error('Login response missing tokens');
  }
  
  await saveTokens(accessToken, refreshToken);
  
  // Also set default header for backward compatibility
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  
  console.log('✅ Session tokens saved and configured');
  
  return { accessToken, refreshToken };
}

/**
 * Clear session and remove auth header
 */
export async function clearSession() {
  await clearTokens();
  delete apiClient.defaults.headers.common['Authorization'];
  console.log('🔓 Session cleared');
}

/**
 * Set global auth error handler (called when refresh fails)
 * Use this to navigate to login screen or show error
 */
export function setAuthErrorHandler(handler) {
  global.authErrorHandler = handler;
}

/**
 * Login to the server
 */
export async function login(username, password, fcmToken) {
  return apiCall(
    async () => {
      const response = await apiClient.post('/login', {
        username,
        password,
        fcmToken
      });
      return response.data;
    },
    {
      operation: 'login',
      endpoint: '/login',
      method: 'POST',
      showToast: false, // Let the component handle the toast
    }
  );
}

/**
 * Refresh authentication token
 */
export async function refreshToken(refreshToken) {
  return apiCall(
    async () => {
      const response = await apiClient.post('/refresh', {
        refresh: refreshToken
      });
      return response.data;
    },
    {
      operation: 'refreshToken',
      endpoint: '/refresh',
      method: 'POST',
      showToast: false,
    }
  );
}

/**
 * Sync health records to server
 */
export async function syncRecords(recordType, data) {
  return apiCall(
    async () => {
      const response = await apiClient.post(`/sync/${recordType}`, {
        data
      });
      return response.data;
    },
    {
      operation: 'syncRecords',
      endpoint: `/sync/${recordType}`,
      method: 'POST',
      recordType,
      recordCount: Array.isArray(data) ? data.length : 1,
      showToast: false,
    }
  );
}

/**
 * Delete records from server
 */
export async function deleteRecords(recordType, uuids) {
  return apiCall(
    async () => {
      const response = await apiClient.delete(`/sync/${recordType}`, {
        data: {
          uuid: uuids
        }
      });
      return response.data;
    },
    {
      operation: 'deleteRecords',
      endpoint: `/sync/${recordType}`,
      method: 'DELETE',
      recordType,
      recordCount: Array.isArray(uuids) ? uuids.length : 1,
      showToast: false,
    }
  );
}

/**
 * Check server health
 */
export async function checkHealth() {
  return apiCall(
    async () => {
      const response = await apiClient.get('/health');
      return response.data;
    },
    {
      operation: 'checkHealth',
      endpoint: '/health',
      method: 'GET',
      showToast: false,
    }
  );
}

// ============================================
// FAMILY MANAGEMENT
// ============================================

/**
 * Get all families the user belongs to
 */
export async function getFamilies() {
  return apiCall(
    async () => {
      const response = await apiClient.get('/family');
      return response.data;
    },
    {
      operation: 'getFamilies',
      endpoint: '/family',
      method: 'GET',
      showToast: false, // Let the component handle the toast
    }
  );
}

/**
 * Create a new family
 * @param {string} name - Optional name for the family
 * @param {string[]} members - Optional list of user IDs to add as members
 */
export async function createFamily(name, members = []) {
  return apiCall(
    async () => {
      const response = await apiClient.post('/family', {
        name,
        members
      });
      return response.data;
    },
    {
      operation: 'createFamily',
      endpoint: '/family',
      method: 'POST',
      familyName: name,
      memberCount: members.length,
      showToast: false,
    }
  );
}

/**
 * Get details of a specific family
 * @param {string} familyId - The family ID
 */
export async function getFamily(familyId) {
  return apiCall(
    async () => {
      const response = await apiClient.get(`/family/${familyId}`);
      return response.data;
    },
    {
      operation: 'getFamily',
      endpoint: `/family/${familyId}`,
      method: 'GET',
      familyId,
      showToast: false,
    }
  );
}

/**
 * Add a member to a family
 * @param {string} familyId - The family ID
 * @param {string} userId - The user ID to add
 */
export async function addFamilyMember(familyId, userId) {
  console.log('addFamilyMember called with:', { familyId, userId });
  console.log('URL will be:', `/family/${familyId}/member`);
  
  return apiCall(
    async () => {
      const response = await apiClient.post(`/family/${familyId}/member`, {
        user_id: userId
      });
      return response.data;
    },
    {
      operation: 'addFamilyMember',
      endpoint: `/family/${familyId}/member`,
      method: 'POST',
      familyId,
      userId,
      showToast: false,
    }
  );
}

/**
 * Remove a member from a family
 * @param {string} familyId - The family ID
 * @param {string} memberId - The member ID to remove
 */
export async function removeFamilyMember(familyId, memberId) {
  return apiCall(
    async () => {
      const response = await apiClient.delete(`/family/${familyId}/member/${memberId}`);
      return response.data;
    },
    {
      operation: 'removeFamilyMember',
      endpoint: `/family/${familyId}/member/${memberId}`,
      method: 'DELETE',
      familyId,
      memberId,
      showToast: false,
    }
  );
}

/**
 * Delete a family
 * @param {string} familyId - The family ID
 */
export async function deleteFamily(familyId) {
  return apiCall(
    async () => {
      const response = await apiClient.delete(`/family/${familyId}`);
      return response.data;
    },
    {
      operation: 'deleteFamily',
      endpoint: `/family/${familyId}`,
      method: 'DELETE',
      familyId,
      showToast: false,
    }
  );
}

// ============================================
// RESPONSE INTERCEPTOR - Auto-refresh on 401/403
// ============================================
apiClient.interceptors.response.use(
  response => {
    // Log opcional en modo debug
    if (config.debug?.apiLogging) {
      console.log(`✅ ${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status}`);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Enhanced error logging with structured format
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('🔴 API REQUEST FAILED');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`Method:   ${error.config?.method?.toUpperCase() || 'UNKNOWN'}`);
    console.error(`URL:      ${error.config?.baseURL}${error.config?.url}`);
    console.error(`Status:   ${error.response?.status || 'No response'}`);
    console.error(`Message:  ${error.message}`);
    console.error(`Code:     ${error.code || 'N/A'}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Check if this is an invalid token error
    const status = error.response?.status;
    const bodyMsg = (error.response?.data?.detail || error.response?.data?.message || '').toString().toLowerCase();
    const isInvalidToken = 
      status === 401 || 
      (status === 403 && bodyMsg.includes('invalid token'));

    // Only retry once per request
    if (isInvalidToken && !originalRequest._retry) {
      originalRequest._retry = true;

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        console.log('🔄 Token expired, attempting refresh...');
        const { refreshToken: storedRefreshToken } = await getStoredTokens();
        
        if (!storedRefreshToken) {
          console.error('❌ No refresh token available');
          isRefreshing = false;
          await clearTokens();
          return Promise.reject(new Error('No refresh token available'));
        }

        // Call refresh endpoint directly (bypass interceptor)
        const { data } = await axios.post(
          `${config.apiBaseUrl}/refresh`,
          { refresh: storedRefreshToken },
          { timeout: 10000 }
        );

        // Backend returns { token, refresh } (not { access, refresh })
        const newAccessToken = data.token || data.access;
        const newRefreshToken = data.refresh || storedRefreshToken;

        if (!newAccessToken) {
          throw new Error('Refresh response missing access token');
        }

        console.log('✅ Token refreshed successfully');
        
        // Save new tokens
        await saveTokens(newAccessToken, newRefreshToken);
        
        // Update default header (for backward compatibility)
        apiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
        
        // Notify queued requests
        onRefreshed(newAccessToken);
        
        isRefreshing = false;

        // Retry the original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);

      } catch (refreshError) {
        console.error('❌ Token refresh failed:', refreshError.message);
        isRefreshing = false;
        
        // Clear tokens and notify queued requests of failure
        await clearTokens();
        refreshSubscribers.forEach(cb => cb(null));
        refreshSubscribers = [];
        
        // Emit event for app to handle (navigate to login, show error, etc.)
        if (global.authErrorHandler) {
          global.authErrorHandler(refreshError);
        }
        
        return Promise.reject(refreshError);
      }
    }

    // Enhanced error diagnostics for network issues
    if (!error.response && error.request) {
      console.error('🔍 Network Diagnostics:');
      console.error(`   • Base URL: ${error.config?.baseURL}`);
      console.error(`   • Timeout: ${error.config?.timeout}ms`);
      console.error(`   • Error Code: ${error.code || 'N/A'}`);
      console.error(`   • Error Message: ${error.message}`);
      console.error('   ⚠️  Possible causes:');
      console.error('      - Backend server not running');
      console.error('      - Network connectivity issues');
      console.error('      - Firewall or VPN blocking connection');
      console.error('      - SSL/Certificate problems');
      console.error('      - DNS resolution issues');
    }

    // Handle other errors with sanitized data
    if (error.response) {
      // Don't log tokens or sensitive data
      const sanitizedData = { ...error.response.data };
      if (sanitizedData.token) sanitizedData.token = '[REDACTED]';
      if (sanitizedData.refresh) sanitizedData.refresh = '[REDACTED]';
      if (sanitizedData.password) sanitizedData.password = '[REDACTED]';
      console.error('API Error Response:', error.response.status, sanitizedData);
    } else if (error.request) {
      console.error('Network Error:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    
    return Promise.reject(error);
  }
);


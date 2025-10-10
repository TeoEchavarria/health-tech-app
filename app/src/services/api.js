// API client for communicating with the backend server
import axios from 'axios';
import config from '../../config';

// Create axios instance with base configuration
export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  }
});

/**
 * Set the authentication token for all requests
 */
export function setAuthToken(token) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
  }
}

/**
 * Login to the server
 */
export async function login(username, password, fcmToken) {
  const response = await apiClient.post('/login', {
    username,
    password,
    fcmToken
  });
  return response.data;
}

/**
 * Refresh authentication token
 */
export async function refreshToken(refreshToken) {
  const response = await apiClient.post('/refresh', {
    refresh: refreshToken
  });
  return response.data;
}

/**
 * Sync health records to server
 */
export async function syncRecords(recordType, data) {
  const response = await apiClient.post(`/sync/${recordType}`, {
    data
  });
  return response.data;
}

/**
 * Delete records from server
 */
export async function deleteRecords(recordType, uuids) {
  const response = await apiClient.delete(`/sync/${recordType}`, {
    data: {
      uuid: uuids
    }
  });
  return response.data;
}

/**
 * Check server health
 */
export async function checkHealth() {
  const response = await apiClient.get('/health');
  return response.data;
}

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response) {
      // Server responded with error status
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request made but no response
      console.error('Network Error:', error.message);
    } else {
      // Something else happened
      console.error('Error:', error.message);
    }
    return Promise.reject(error);
  }
);


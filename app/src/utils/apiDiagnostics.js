/**
 * API diagnostics and connectivity testing utilities
 * Provides comprehensive testing of API endpoints and network connectivity
 */

import { apiClient } from '../services/api';
import { healthCheck } from './apiWrapper';
import config from '../../config';

/**
 * Comprehensive API connection diagnostics
 * @returns {Promise<Object>} Detailed diagnostics results
 */
export async function diagnoseApiConnection() {
  const results = {
    timestamp: new Date().toISOString(),
    baseURL: config.apiBaseUrl,
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };
  
  console.log('🔍 Running API diagnostics...');
  console.log(`   Testing: ${config.apiBaseUrl}`);
  
  // Test 1: Basic connectivity (health endpoint)
  await runTest('Health Check', async () => {
    const response = await apiClient.get('/health', { timeout: 10000 });
    return response.data;
  }, results);
  
  // Test 2: Authentication endpoint (if available)
  await runTest('Auth Endpoint', async () => {
    const response = await apiClient.get('/login', { timeout: 5000 });
    return response.status; // We expect 405 Method Not Allowed for GET
  }, results);
  
  // Test 3: Family endpoint (requires auth, will likely fail but tests routing)
  await runTest('Family Endpoint', async () => {
    const response = await apiClient.get('/family', { timeout: 5000 });
    return response.data;
  }, results);
  
  // Test 4: Ingest endpoint health
  await runTest('Ingest Health', async () => {
    const response = await apiClient.get('/ingest/health', { timeout: 5000 });
    return response.data;
  }, results);
  
  // Test 5: Network configuration analysis
  await runNetworkAnalysis(results);
  
  // Calculate summary
  results.summary.total = results.tests.length;
  results.summary.passed = results.tests.filter(t => t.status === 'PASS').length;
  results.summary.failed = results.summary.total - results.summary.passed;
  
  // Log summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 API DIAGNOSTICS SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Tests:  ${results.summary.total}`);
  console.log(`Passed:       ${results.summary.passed}`);
  console.log(`Failed:       ${results.summary.failed}`);
  console.log(`Success Rate: ${Math.round((results.summary.passed / results.summary.total) * 100)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  return results;
}

/**
 * Run a single diagnostic test
 * @param {string} testName - Name of the test
 * @param {Function} testFn - The test function
 * @param {Object} results - Results object to update
 */
async function runTest(testName, testFn, results) {
  const startTime = Date.now();
  
  try {
    console.log(`   🧪 Testing: ${testName}...`);
    const data = await testFn();
    const duration = Date.now() - startTime;
    
    results.tests.push({
      name: testName,
      status: 'PASS',
      duration,
      data: typeof data === 'object' ? JSON.stringify(data) : data
    });
    
    console.log(`   ✅ ${testName} passed (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    results.tests.push({
      name: testName,
      status: 'FAIL',
      duration,
      error: error.type || 'UNKNOWN',
      message: error.message,
      statusCode: error.statusCode
    });
    
    console.error(`   ❌ ${testName} failed: ${error.message}`);
  }
}

/**
 * Analyze network configuration and connectivity
 * @param {Object} results - Results object to update
 */
async function runNetworkAnalysis(results) {
  try {
    const url = new URL(config.apiBaseUrl);
    
    results.network = {
      hostname: url.hostname,
      protocol: url.protocol,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      pathname: url.pathname,
      fullURL: config.apiBaseUrl
    };
    
    console.log(`   🌐 Network Analysis:`);
    console.log(`      Hostname: ${results.network.hostname}`);
    console.log(`      Protocol: ${results.network.protocol}`);
    console.log(`      Port: ${results.network.port}`);
    
    // Check for common issues
    const issues = [];
    
    if (results.network.protocol === 'http:' && results.network.port === '443') {
      issues.push('HTTP protocol with HTTPS port - may cause connection issues');
    }
    
    if (results.network.protocol === 'https:' && results.network.port === '80') {
      issues.push('HTTPS protocol with HTTP port - may cause connection issues');
    }
    
    if (results.network.hostname === 'localhost' || results.network.hostname === '127.0.0.1') {
      issues.push('Using localhost - ensure device and server are on same network');
    }
    
    if (issues.length > 0) {
      results.network.issues = issues;
      console.log(`   ⚠️  Potential issues detected:`);
      issues.forEach(issue => console.log(`      - ${issue}`));
    }
    
  } catch (error) {
    console.error(`   ❌ Network analysis failed: ${error.message}`);
    results.network = { error: error.message };
  }
}

/**
 * Quick connectivity test
 * @returns {Promise<boolean>} True if API is reachable
 */
export async function quickConnectivityTest() {
  try {
    const result = await healthCheck(async () => {
      const response = await apiClient.get('/health', { timeout: 5000 });
      return response.data;
    }, { operation: 'quickConnectivityTest' });
    
    return result.success;
  } catch (error) {
    console.error('Quick connectivity test failed:', error.message);
    return false;
  }
}

/**
 * Test specific endpoint with detailed error reporting
 * @param {string} endpoint - The endpoint to test
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test result
 */
export async function testEndpoint(endpoint, method = 'GET', options = {}) {
  const { timeout = 10000, data = null, headers = {} } = options;
  
  const startTime = Date.now();
  
  try {
    console.log(`🧪 Testing ${method} ${endpoint}...`);
    
    let response;
    const config = { timeout, headers };
    
    switch (method.toUpperCase()) {
      case 'GET':
        response = await apiClient.get(endpoint, config);
        break;
      case 'POST':
        response = await apiClient.post(endpoint, data, config);
        break;
      case 'PUT':
        response = await apiClient.put(endpoint, data, config);
        break;
      case 'DELETE':
        response = await apiClient.delete(endpoint, config);
        break;
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
    
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      status: response.status,
      data: response.data,
      duration,
      endpoint,
      method
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      error: error.type || 'UNKNOWN',
      message: error.message,
      statusCode: error.statusCode,
      duration,
      endpoint,
      method
    };
  }
}

/**
 * Monitor API health over time
 * @param {number} intervalMs - Monitoring interval in milliseconds
 * @param {number} durationMs - Total monitoring duration
 * @returns {Promise<Object>} Monitoring results
 */
export async function monitorApiHealth(intervalMs = 30000, durationMs = 300000) {
  const results = {
    startTime: new Date().toISOString(),
    interval: intervalMs,
    duration: durationMs,
    checks: []
  };
  
  console.log(`📊 Starting API health monitoring for ${durationMs / 1000}s...`);
  
  const endTime = Date.now() + durationMs;
  
  while (Date.now() < endTime) {
    const check = await quickConnectivityTest();
    const timestamp = new Date().toISOString();
    
    results.checks.push({
      timestamp,
      success: check,
      responseTime: Date.now() - new Date(timestamp).getTime()
    });
    
    console.log(`${check ? '✅' : '❌'} Health check at ${timestamp}: ${check ? 'PASS' : 'FAIL'}`);
    
    if (Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  results.endTime = new Date().toISOString();
  results.successRate = results.checks.filter(c => c.success).length / results.checks.length;
  
  console.log(`📊 Monitoring completed. Success rate: ${Math.round(results.successRate * 100)}%`);
  
  return results;
}


/**
 * React hook for subscribing to Wear OS sensor streams
 * Provides real-time access to accelerometer and other sensor data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { ingestRecords } from '../services/ingestService';
import { createIMUSyncManager } from '../services/imuSync';
import { getIngestQueue } from '../utils/ingestQueue';
import config from '../../config';

// Import the native sensor module (will be created)
const { WearSensorModule } = NativeModules;
const eventEmitter = WearSensorModule ? new NativeEventEmitter(WearSensorModule) : null;

/**
 * Hook for subscribing to Wear OS sensor streams
 * @param {string} sensorType - Type of sensor ('accelerometer', 'gyroscope', 'heartRate')
 * @param {Object} options - Configuration options
 * @param {number} options.sampleRateHz - Sample rate in Hz
 * @param {number} options.chunkDurationMs - Duration of each chunk in milliseconds
 * @param {boolean} options.autoSync - Whether to automatically sync to server
 * @param {boolean} options.offlineQueue - Whether to queue data when offline
 * @returns {Object} Hook state and methods
 */
export function useSensorStream(sensorType, options = {}) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastChunk, setLastChunk] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalSamples: 0,
    totalChunks: 0,
    lastSyncTime: null
  });

  // Refs for managing state
  const imuManagerRef = useRef(null);
  const queueRef = useRef(null);
  const subscriptionRef = useRef(null);

  // Default options
  const {
    sampleRateHz = 50,
    chunkDurationMs = 5000,
    autoSync = true,
    offlineQueue = true,
    deviceId = null,
    deviceModel = null
  } = options;

  // Initialize IMU manager and queue
  useEffect(() => {
    if (sensorType === 'accelerometer') {
      // Create IMU sync manager
      imuManagerRef.current = createIMUSyncManager({
        deviceId,
        deviceModel,
        sampleRateHz,
        chunkDurationMs,
        autoSync
      });

      // Get ingest queue for offline support
      if (offlineQueue) {
        queueRef.current = getIngestQueue();
      }
    }

    return () => {
      // Cleanup on unmount
      if (imuManagerRef.current) {
        imuManagerRef.current.stopStreaming();
      }
    };
  }, [sensorType, sampleRateHz, chunkDurationMs, autoSync, offlineQueue, deviceId, deviceModel]);

  // Set up event listeners for sensor data
  useEffect(() => {
    if (!eventEmitter || sensorType !== 'accelerometer') {
      return;
    }

    // Listen for accelerometer chunks
    subscriptionRef.current = eventEmitter.addListener('AccelerometerChunk', async (chunkData) => {
      try {
        setLastChunk(chunkData);
        
        if (autoSync) {
          // Auto-sync to server
          await ingestRecords('Accelerometer', chunkData);
        } else if (offlineQueue && queueRef.current) {
          // Queue for later sync
          await queueRef.current.enqueue('Accelerometer', chunkData);
        }

        // Update stats
        if (imuManagerRef.current) {
          setStats(imuManagerRef.current.getStats());
        }
      } catch (err) {
        console.error('Error handling sensor chunk:', err);
        setError(err.message);
      }
    });

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
      }
    };
  }, [sensorType, autoSync, offlineQueue]);

  // Start streaming
  const start = useCallback(async () => {
    try {
      setError(null);
      
      // PRIORITY 1: Use native sensor module if available
      if (WearSensorModule && eventEmitter && sensorType === 'accelerometer') {
        await WearSensorModule.startAccelerometer(sampleRateHz);
        setIsStreaming(true);
        console.log('🚀 Started NATIVE accelerometer streaming');
      } 
      // FALLBACK: Use JS simulation (for testing without device)
      else if (sensorType === 'accelerometer' && imuManagerRef.current) {
        imuManagerRef.current.startStreaming();
        setIsStreaming(true);
        console.warn('⚠️ Started SIMULATED accelerometer (no real sensor data)');
      } 
      else {
        throw new Error('Sensor module not available');
      }
    } catch (err) {
      console.error('Failed to start sensor streaming:', err);
      setError(err.message);
    }
  }, [sensorType, sampleRateHz]);

  // Stop streaming
  const stop = useCallback(async () => {
    try {
      if (WearSensorModule && sensorType === 'accelerometer') {
        await WearSensorModule.stopAccelerometer();
        setIsStreaming(false);
        console.log('🛑 Stopped native accelerometer streaming');
      } else if (sensorType === 'accelerometer' && imuManagerRef.current) {
        imuManagerRef.current.stopStreaming();
        setIsStreaming(false);
        console.log('🛑 Stopped simulated accelerometer');
      }
    } catch (err) {
      console.error('Failed to stop sensor streaming:', err);
      setError(err.message);
    }
  }, [sensorType]);

  // Flush offline queue
  const flushQueue = useCallback(async () => {
    if (queueRef.current) {
      try {
        await queueRef.current.flush();
        console.log('📤 Flushed offline queue');
      } catch (err) {
        console.error('Failed to flush queue:', err);
        setError(err.message);
      }
    }
  }, []);

  // Get queue status
  const getQueueStatus = useCallback(async () => {
    if (queueRef.current) {
      try {
        const stats = await queueRef.current.getStats();
        return stats;
      } catch (err) {
        console.error('Failed to get queue status:', err);
        return null;
      }
    }
    return null;
  }, []);

  // Add sample manually (for testing)
  const addSample = useCallback((x, y, z, tOffsetMs = null, ts = null) => {
    if (imuManagerRef.current && isStreaming) {
      imuManagerRef.current.addSample(x, y, z, tOffsetMs, ts);
    }
  }, [isStreaming]);

  // Get current chunk status
  const getChunkStatus = useCallback(() => {
    if (imuManagerRef.current) {
      return imuManagerRef.current.getChunkStatus();
    }
    return null;
  }, []);

  return {
    // State
    isStreaming,
    lastChunk,
    error,
    stats,
    
    // Methods
    start,
    stop,
    flushQueue,
    getQueueStatus,
    addSample,
    getChunkStatus,
    
    // Configuration
    sensorType,
    sampleRateHz,
    chunkDurationMs,
    autoSync,
    offlineQueue
  };
}

/**
 * Hook specifically for accelerometer data with simplified API
 * @param {Object} options - Configuration options
 * @returns {Object} Accelerometer-specific hook state and methods
 */
export function useAccelerometer(options = {}) {
  const sensorHook = useSensorStream('accelerometer', {
    sampleRateHz: config.sensors?.accelerometer?.sampleRateHz || 50,
    chunkDurationMs: config.sensors?.accelerometer?.chunkDurationMs || 5000,
    autoSync: config.sensors?.accelerometer?.autoSync !== false,
    deviceId: config.sensors?.accelerometer?.deviceId,
    deviceModel: config.sensors?.accelerometer?.deviceModel,
    ...options
  });

  return {
    ...sensorHook,
    // Accelerometer-specific methods
    addAccelerometerSample: sensorHook.addSample,
    getAccelerometerStats: () => sensorHook.stats,
    isAccelerometerEnabled: config.sensors?.accelerometer?.enabled || false
  };
}

/**
 * Hook for managing offline queue operations
 * @returns {Object} Queue management methods
 */
export function useOfflineQueue() {
  const queue = getIngestQueue();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Update pending count periodically
  useEffect(() => {
    const updatePendingCount = async () => {
      try {
        const count = await queue.getPendingCount();
        setPendingCount(count);
      } catch (error) {
        console.error('Failed to get pending count:', error);
      }
    };

    // Initial update
    updatePendingCount();

    // Update every 30 seconds
    const interval = setInterval(updatePendingCount, 30000);

    return () => clearInterval(interval);
  }, []);

  const flush = useCallback(async () => {
    setIsProcessing(true);
    try {
      const result = await queue.flush();
      setPendingCount(await queue.getPendingCount());
      return result;
    } catch (error) {
      console.error('Failed to flush queue:', error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [queue]);

  const getStats = useCallback(async () => {
    try {
      return await queue.getStats();
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return null;
    }
  }, [queue]);

  const clear = useCallback(async () => {
    try {
      await queue.clear();
      setPendingCount(0);
    } catch (error) {
      console.error('Failed to clear queue:', error);
      throw error;
    }
  }, [queue]);

  return {
    pendingCount,
    isProcessing,
    flush,
    getStats,
    clear
  };
}

export default useSensorStream;


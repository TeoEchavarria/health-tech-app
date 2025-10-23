/**
 * IMU (Inertial Measurement Unit) sync service for accelerometer data
 * Handles chunking accelerometer samples and syncing to /ingest/Accelerometer endpoint
 */

import { ingestAccelerometerChunk } from './ingestService';
import { IngestQueue } from '../utils/ingestQueue';

/**
 * Accelerometer sample data structure
 */
export class AccelSample {
  constructor(x, y, z, tOffsetMs = null, ts = null) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.tOffsetMs = tOffsetMs;
    this.ts = ts;
  }
}

/**
 * Accelerometer chunk builder for collecting samples into batches
 */
export class AccelerometerChunkBuilder {
  constructor(deviceId, deviceModel = null, platform = 'wear-os', sampleRateHz = 50) {
    this.deviceId = deviceId;
    this.deviceModel = deviceModel;
    this.platform = platform;
    this.sampleRateHz = sampleRateHz;
    this.samples = [];
    this.startedAt = null;
    this.chunkDurationMs = 5000; // 5 seconds default
    this.maxSamples = Math.floor((sampleRateHz * this.chunkDurationMs) / 1000); // ~250 samples at 50Hz
  }

  /**
   * Add a sample to the current chunk
   * @param {number} x - X acceleration value
   * @param {number} y - Y acceleration value  
   * @param {number} z - Z acceleration value
   * @param {number} tOffsetMs - Time offset from chunk start (milliseconds)
   * @param {Date} ts - Absolute timestamp (optional, overrides tOffsetMs)
   */
  addSample(x, y, z, tOffsetMs = null, ts = null) {
    // Set chunk start time if this is the first sample
    if (!this.startedAt) {
      this.startedAt = ts || new Date();
    }

    // Calculate offset if not provided
    if (tOffsetMs === null && ts) {
      tOffsetMs = ts.getTime() - this.startedAt.getTime();
    } else if (tOffsetMs === null) {
      // Use sample index * estimated sample interval
      tOffsetMs = this.samples.length * (1000 / this.sampleRateHz);
    }

    const sample = new AccelSample(x, y, z, tOffsetMs, ts);
    this.samples.push(sample);

    // Check if chunk is ready to be flushed
    if (this.samples.length >= this.maxSamples) {
      return this.flushChunk();
    }

    return null;
  }

  /**
   * Build the current chunk into the format expected by the backend
   * @returns {Object} Formatted chunk data
   */
  buildChunk() {
    if (this.samples.length === 0) {
      return null;
    }

    return {
      deviceId: this.deviceId,
      deviceModel: this.deviceModel,
      platform: this.platform,
      sampleRateHz: this.sampleRateHz,
      startedAt: this.startedAt.toISOString(),
      samples: this.samples.map(sample => ({
        x: sample.x,
        y: sample.y,
        z: sample.z,
        ...(sample.ts ? { ts: sample.ts.toISOString() } : { tOffsetMs: sample.tOffsetMs })
      }))
    };
  }

  /**
   * Flush the current chunk and reset for next chunk
   * @returns {Object} The flushed chunk data
   */
  flushChunk() {
    const chunk = this.buildChunk();
    
    if (chunk) {
      console.log(`📦 Flushing accelerometer chunk: ${chunk.samples.length} samples`);
      
      // Reset for next chunk
      this.samples = [];
      this.startedAt = null;
    }

    return chunk;
  }

  /**
   * Force flush current chunk (even if not full)
   * @returns {Object} The flushed chunk data
   */
  forceFlush() {
    const chunk = this.buildChunk();
    
    if (chunk) {
      console.log(`📦 Force flushing accelerometer chunk: ${chunk.samples.length} samples`);
      
      // Reset for next chunk
      this.samples = [];
      this.startedAt = null;
    }

    return chunk;
  }

  /**
   * Get current chunk status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      sampleCount: this.samples.length,
      maxSamples: this.maxSamples,
      isFull: this.samples.length >= this.maxSamples,
      startedAt: this.startedAt,
      deviceId: this.deviceId
    };
  }
}

/**
 * IMU sync manager for handling accelerometer data collection and syncing
 */
export class IMUSyncManager {
  constructor(options = {}) {
    this.deviceId = options.deviceId || this.generateDeviceId();
    this.deviceModel = options.deviceModel || null;
    this.platform = options.platform || 'wear-os';
    this.sampleRateHz = options.sampleRateHz || 50;
    this.chunkDurationMs = options.chunkDurationMs || 5000;
    this.autoSync = options.autoSync !== false; // Default to true
    this.offlineQueue = options.offlineQueue || new IngestQueue();
    
    this.chunkBuilder = new AccelerometerChunkBuilder(
      this.deviceId,
      this.deviceModel,
      this.platform,
      this.sampleRateHz
    );
    
    this.isStreaming = false;
    this.totalSamples = 0;
    this.totalChunks = 0;
    this.lastSyncTime = null;
  }

  /**
   * Generate a unique device ID
   * @returns {string} Device ID
   */
  generateDeviceId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `device-${timestamp}-${random}`;
  }

  /**
   * Start accelerometer streaming
   */
  startStreaming() {
    if (this.isStreaming) {
      console.log('⚠️ Accelerometer already streaming');
      return;
    }

    this.isStreaming = true;
    this.totalSamples = 0;
    this.totalChunks = 0;
    
    console.log(`🚀 Starting accelerometer stream: ${this.sampleRateHz}Hz, device: ${this.deviceId}`);
  }

  /**
   * Stop accelerometer streaming
   */
  stopStreaming() {
    if (!this.isStreaming) {
      console.log('⚠️ Accelerometer not streaming');
      return;
    }

    this.isStreaming = false;
    
    // Flush any remaining samples
    const finalChunk = this.chunkBuilder.forceFlush();
    if (finalChunk) {
      this.handleChunk(finalChunk);
    }
    
    console.log(`🛑 Stopped accelerometer stream. Total: ${this.totalSamples} samples, ${this.totalChunks} chunks`);
  }

  /**
   * Add accelerometer sample
   * @param {number} x - X acceleration
   * @param {number} y - Y acceleration
   * @param {number} z - Z acceleration
   * @param {number} tOffsetMs - Time offset (optional)
   * @param {Date} ts - Timestamp (optional)
   */
  addSample(x, y, z, tOffsetMs = null, ts = null) {
    if (!this.isStreaming) {
      console.warn('⚠️ Not streaming - sample ignored');
      return;
    }

    this.totalSamples++;
    
    const chunk = this.chunkBuilder.addSample(x, y, z, tOffsetMs, ts);
    
    if (chunk) {
      this.handleChunk(chunk);
    }
  }

  /**
   * Handle a completed chunk
   * @param {Object} chunk - Accelerometer chunk data
   */
  async handleChunk(chunk) {
    this.totalChunks++;
    
    try {
      if (this.autoSync) {
        await this.syncChunk(chunk);
      } else {
        // Queue for later sync
        await this.offlineQueue.enqueue('Accelerometer', chunk, 'normal');
        console.log(`📥 Queued accelerometer chunk (${this.offlineQueue.getPendingCount()} pending)`);
      }
    } catch (error) {
      console.error('❌ Failed to handle accelerometer chunk:', error);
      
      // Queue for retry
      await this.offlineQueue.enqueue('Accelerometer', chunk, 'normal');
    }
  }

  /**
   * Sync a chunk to the server
   * @param {Object} chunk - Accelerometer chunk data
   */
  async syncChunk(chunk) {
    try {
      const result = await ingestAccelerometerChunk(chunk);
      this.lastSyncTime = new Date();
      
      console.log(`✅ Accelerometer chunk synced: ${result.upserts} upserts`);
      return result;
    } catch (error) {
      console.error('❌ Failed to sync accelerometer chunk:', error);
      throw error;
    }
  }

  /**
   * Flush all pending chunks from queue
   */
  async flushQueue() {
    try {
      const pendingCount = await this.offlineQueue.getPendingCount();
      if (pendingCount > 0) {
        console.log(`📤 Flushing ${pendingCount} pending accelerometer chunks...`);
        await this.offlineQueue.flush();
        this.lastSyncTime = new Date();
      }
    } catch (error) {
      console.error('❌ Failed to flush accelerometer queue:', error);
      throw error;
    }
  }

  /**
   * Get sync statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      isStreaming: this.isStreaming,
      totalSamples: this.totalSamples,
      totalChunks: this.totalChunks,
      lastSyncTime: this.lastSyncTime,
      deviceId: this.deviceId,
      sampleRateHz: this.sampleRateHz,
      chunkDurationMs: this.chunkDurationMs
    };
  }

  /**
   * Get current chunk status
   * @returns {Object} Chunk status
   */
  getChunkStatus() {
    return this.chunkBuilder.getStatus();
  }
}

/**
 * Create a default IMU sync manager instance
 * @param {Object} options - Configuration options
 * @returns {IMUSyncManager} IMU sync manager instance
 */
export function createIMUSyncManager(options = {}) {
  return new IMUSyncManager(options);
}

/**
 * Utility function to simulate accelerometer data for testing
 * @param {IMUSyncManager} manager - IMU sync manager
 * @param {number} durationSeconds - Duration to simulate (seconds)
 * @param {number} sampleRateHz - Sample rate
 */
export function simulateAccelerometerData(manager, durationSeconds = 10, sampleRateHz = 50) {
  console.log(`🧪 Simulating ${durationSeconds}s of accelerometer data at ${sampleRateHz}Hz`);
  
  manager.startStreaming();
  
  const sampleInterval = 1000 / sampleRateHz; // milliseconds
  const totalSamples = durationSeconds * sampleRateHz;
  let sampleCount = 0;
  
  const interval = setInterval(() => {
    // Simulate walking/running motion with some noise
    const time = sampleCount / sampleRateHz;
    const x = 0.1 * Math.sin(time * 2) + (Math.random() - 0.5) * 0.05;
    const y = 9.8 + 0.3 * Math.sin(time * 4) + (Math.random() - 0.5) * 0.1;
    const z = 0.1 * Math.cos(time * 2) + (Math.random() - 0.5) * 0.05;
    
    manager.addSample(x, y, z);
    
    sampleCount++;
    
    if (sampleCount >= totalSamples) {
      clearInterval(interval);
      manager.stopStreaming();
      console.log('🧪 Simulation complete');
    }
  }, sampleInterval);
  
  return interval;
}

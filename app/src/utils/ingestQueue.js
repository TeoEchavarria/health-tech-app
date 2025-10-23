/**
 * Offline queue manager for ingesting data when network is unavailable
 * Uses AsyncStorage for persistence and provides retry logic with exponential backoff
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ingestRecords } from '../services/ingestService';

const QUEUE_KEY = 'ingest_queue';
const MAX_QUEUE_SIZE = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // 1s, 5s, 15s

/**
 * Queue item structure
 */
class QueueItem {
  constructor(id, recordType, data, priority = 'normal', timestamp = null, retries = 0) {
    this.id = id;
    this.recordType = recordType;
    this.data = data;
    this.priority = priority; // 'high', 'normal', 'low'
    this.timestamp = timestamp || new Date().toISOString();
    this.retries = retries;
  }

  /**
   * Check if item should be retried
   * @returns {boolean} True if item should be retried
   */
  shouldRetry() {
    return this.retries < MAX_RETRIES;
  }

  /**
   * Get retry delay based on current retry count
   * @returns {number} Delay in milliseconds
   */
  getRetryDelay() {
    const delayIndex = Math.min(this.retries, RETRY_DELAYS.length - 1);
    return RETRY_DELAYS[delayIndex];
  }

  /**
   * Increment retry count
   */
  incrementRetries() {
    this.retries++;
  }

  /**
   * Convert to JSON-serializable object
   * @returns {Object} Serializable object
   */
  toJSON() {
    return {
      id: this.id,
      recordType: this.recordType,
      data: this.data,
      priority: this.priority,
      timestamp: this.timestamp,
      retries: this.retries
    };
  }

  /**
   * Create from JSON object
   * @param {Object} obj - JSON object
   * @returns {QueueItem} Queue item instance
   */
  static fromJSON(obj) {
    return new QueueItem(
      obj.id,
      obj.recordType,
      obj.data,
      obj.priority,
      obj.timestamp,
      obj.retries
    );
  }
}

/**
 * Offline ingest queue manager
 */
export class IngestQueue {
  constructor(options = {}) {
    this.maxQueueSize = options.maxQueueSize || MAX_QUEUE_SIZE;
    this.maxRetries = options.maxRetries || MAX_RETRIES;
    this.retryDelays = options.retryDelays || RETRY_DELAYS;
    this.batchSize = options.batchSize || 10;
    this.isProcessing = false;
  }

  /**
   * Generate unique ID for queue item
   * @returns {string} Unique ID
   */
  generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${timestamp}-${random}`;
  }

  /**
   * Get priority weight for sorting
   * @param {string} priority - Priority level
   * @returns {number} Weight value
   */
  getPriorityWeight(priority) {
    const weights = { high: 3, normal: 2, low: 1 };
    return weights[priority] || 2;
  }

  /**
   * Load queue from AsyncStorage
   * @returns {Promise<Array<QueueItem>>} Queue items
   */
  async loadQueue() {
    try {
      const queueData = await AsyncStorage.getItem(QUEUE_KEY);
      if (!queueData) {
        return [];
      }

      const items = JSON.parse(queueData);
      return items.map(item => QueueItem.fromJSON(item));
    } catch (error) {
      console.error('❌ Failed to load ingest queue:', error);
      return [];
    }
  }

  /**
   * Save queue to AsyncStorage
   * @param {Array<QueueItem>} items - Queue items to save
   * @returns {Promise<void>}
   */
  async saveQueue(items) {
    try {
      const queueData = JSON.stringify(items.map(item => item.toJSON()));
      await AsyncStorage.setItem(QUEUE_KEY, queueData);
    } catch (error) {
      console.error('❌ Failed to save ingest queue:', error);
      throw error;
    }
  }

  /**
   * Add item to queue
   * @param {string} recordType - Type of record
   * @param {Object} data - Record data
   * @param {string} priority - Priority level ('high', 'normal', 'low')
   * @returns {Promise<string>} Item ID
   */
  async enqueue(recordType, data, priority = 'normal') {
    const items = await this.loadQueue();
    
    // Check queue size limit
    if (items.length >= this.maxQueueSize) {
      // Remove oldest low priority items first
      const sortedItems = items.sort((a, b) => {
        const priorityDiff = this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });
      
      // Remove oldest low priority item
      const lowPriorityIndex = sortedItems.findIndex(item => item.priority === 'low');
      if (lowPriorityIndex !== -1) {
        sortedItems.splice(lowPriorityIndex, 1);
        console.log(`🗑️ Removed low priority item to make room for new queue item`);
      } else {
        // Remove oldest item if no low priority items
        sortedItems.pop();
        console.log(`🗑️ Removed oldest item to make room for new queue item`);
      }
      
      await this.saveQueue(sortedItems);
    }

    const id = this.generateId();
    const item = new QueueItem(id, recordType, data, priority);
    
    items.push(item);
    await this.saveQueue(items);
    
    console.log(`📥 Enqueued ${recordType} item (${items.length}/${this.maxQueueSize} in queue)`);
    
    return id;
  }

  /**
   * Remove items from queue
   * @param {number} maxBatch - Maximum number of items to remove
   * @returns {Promise<Array<QueueItem>>} Removed items
   */
  async dequeue(maxBatch = null) {
    const items = await this.loadQueue();
    const batchSize = maxBatch || this.batchSize;
    
    if (items.length === 0) {
      return [];
    }

    // Sort by priority and timestamp
    const sortedItems = items.sort((a, b) => {
      const priorityDiff = this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    const dequeuedItems = sortedItems.splice(0, Math.min(batchSize, sortedItems.length));
    
    await this.saveQueue(sortedItems);
    
    console.log(`📤 Dequeued ${dequeuedItems.length} items (${sortedItems.length} remaining)`);
    
    return dequeuedItems;
  }

  /**
   * Get number of pending items
   * @returns {Promise<number>} Pending count
   */
  async getPendingCount() {
    const items = await this.loadQueue();
    return items.length;
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue statistics
   */
  async getStats() {
    const items = await this.loadQueue();
    
    const stats = {
      total: items.length,
      byPriority: { high: 0, normal: 0, low: 0 },
      byRecordType: {},
      oldestItem: null,
      newestItem: null
    };

    items.forEach(item => {
      // Count by priority
      stats.byPriority[item.priority]++;
      
      // Count by record type
      stats.byRecordType[item.recordType] = (stats.byRecordType[item.recordType] || 0) + 1;
      
      // Track oldest and newest
      const itemTime = new Date(item.timestamp);
      if (!stats.oldestItem || itemTime < new Date(stats.oldestItem.timestamp)) {
        stats.oldestItem = item;
      }
      if (!stats.newestItem || itemTime > new Date(stats.newestItem.timestamp)) {
        stats.newestItem = item;
      }
    });

    return stats;
  }

  /**
   * Clear all items from queue
   * @returns {Promise<void>}
   */
  async clear() {
    await AsyncStorage.removeItem(QUEUE_KEY);
    console.log('🗑️ Cleared ingest queue');
  }

  /**
   * Process queue items and attempt to sync them
   * @param {number} maxBatch - Maximum number of items to process
   * @returns {Promise<{success: number, failed: number, retried: number}>}
   */
  async flush(maxBatch = null) {
    if (this.isProcessing) {
      console.log('⚠️ Queue flush already in progress');
      return { success: 0, failed: 0, retried: 0 };
    }

    this.isProcessing = true;
    
    try {
      const items = await this.dequeue(maxBatch);
      
      if (items.length === 0) {
        return { success: 0, failed: 0, retried: 0 };
      }

      console.log(`🔄 Processing ${items.length} queue items...`);

      let success = 0;
      let failed = 0;
      let retried = 0;

      for (const item of items) {
        try {
          await ingestRecords(item.recordType, item.data);
          success++;
          console.log(`✅ Synced queued ${item.recordType} item`);
        } catch (error) {
          console.error(`❌ Failed to sync queued ${item.recordType} item:`, error.message);
          
          if (item.shouldRetry()) {
            // Re-queue with incremented retry count
            item.incrementRetries();
            await this.enqueue(item.recordType, item.data, item.priority);
            retried++;
            
            // Add delay before retry
            await new Promise(resolve => setTimeout(resolve, item.getRetryDelay()));
          } else {
            // Max retries exceeded, give up
            failed++;
            console.error(`❌ Max retries exceeded for ${item.recordType} item, giving up`);
          }
        }
      }

      console.log(`📊 Queue flush complete: ${success} success, ${failed} failed, ${retried} retried`);
      
      return { success, failed, retried };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start automatic queue processing
   * @param {number} intervalMs - Processing interval in milliseconds
   * @returns {Object} Interval reference for stopping
   */
  startAutoProcessing(intervalMs = 300000) { // 5 minutes default
    console.log(`🔄 Starting auto queue processing every ${intervalMs}ms`);
    
    const interval = setInterval(async () => {
      try {
        const pendingCount = await this.getPendingCount();
        if (pendingCount > 0) {
          console.log(`🔄 Auto-processing ${pendingCount} pending items...`);
          await this.flush();
        }
      } catch (error) {
        console.error('❌ Auto queue processing failed:', error);
      }
    }, intervalMs);

    return interval;
  }

  /**
   * Stop automatic queue processing
   * @param {Object} interval - Interval reference from startAutoProcessing
   */
  stopAutoProcessing(interval) {
    if (interval) {
      clearInterval(interval);
      console.log('🛑 Stopped auto queue processing');
    }
  }
}

/**
 * Create a default ingest queue instance
 * @param {Object} options - Configuration options
 * @returns {IngestQueue} Ingest queue instance
 */
export function createIngestQueue(options = {}) {
  return new IngestQueue(options);
}

/**
 * Get a singleton instance of the ingest queue
 * @returns {IngestQueue} Singleton queue instance
 */
let singletonQueue = null;
export function getIngestQueue() {
  if (!singletonQueue) {
    singletonQueue = new IngestQueue();
  }
  return singletonQueue;
}


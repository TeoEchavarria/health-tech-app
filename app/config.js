// Configuration file for the Hacking Health app

const config = {
  // API Base URL - Change this to your server URL
  // Examples:
  // - For local development (Android emulator): 'http://10.0.2.2:8000'
  // - For production: 'https://api.hcgateway.shuchir.dev'
  apiBaseUrl: 'https://apihealth.echavarrias.com', //'http://10.0.2.2:8000', 
  
  // Default sync interval in hours
  defaultSyncIntervalHours: 2,
  
  // Default sync mode - true for full 30-day sync, false for incremental
  defaultFullSyncMode: true,
  
  // Sentry DSN for error tracking
  sentryDsn: 'https://e4a201b96ea602d28e90b5e4bbe67aa6@sentry.shuchir.dev/6',

  // Ingest endpoint configuration
  ingest: {
    enabled: true, // Master switch for ingest endpoints
    recordTypes: {
      HeartRate: true,        // Use /ingest/ for raw storage
      Steps: true,           // Use /ingest/ for raw storage
      Accelerometer: true,   // Use /ingest/ for accelerometer chunks
      Distance: false,       //  Keep on /sync/ for now
      SleepSession: false,   // Keep on /sync/ for aggregated data
      ExerciseSession: false, // Keep on /sync/ for aggregated data
      // Add other record types as needed
    },
    offlineQueueSize: 1000,  // Max items in offline queue
    flushIntervalMs: 300000, // 5 minutes auto-flush interval
    batchSize: 10,           // Items to process per batch
    maxRetries: 3,           // Max retry attempts for failed items
  },

  // Sensor configuration
  sensors: {
    accelerometer: {
      enabled: true,         // Enable for testing sensor streaming
      sampleRateHz: 50,      // Sample rate for accelerometer
      chunkDurationMs: 5000, // 5 seconds per chunk
      autoSync: true,        // Auto-sync chunks to server
      deviceId: null,        // Will be generated if null
      deviceModel: null,     // Device model identifier
      platform: 'wear-os',  // Platform identifier
    },
    gyroscope: {
      enabled: false,        // Future sensor support
      sampleRateHz: 50,
      chunkDurationMs: 5000,
    }
  },

  // Migration configuration
  migration: {
    parallelMode: false,     // Send to both /sync/ and /ingest/ simultaneously
    testMode: false,         // Enable detailed logging for testing
    gradualRollout: true,    // Gradually migrate record types
  },

  // Debug configuration
  debug: {
    enabled: false,          // Master debug switch
    apiLogging: false,      // Log all API calls and responses
    errorDetails: true,      // Show detailed error information
    diagnostics: false,     // Run API diagnostics on startup
  }
};

export default config;


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
};

export default config;


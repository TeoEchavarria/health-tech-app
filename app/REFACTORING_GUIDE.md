# HCGateway Refactoring Guide

## Overview

The app has been refactored into a modular architecture with the following improvements:

1. **Modular Services** - Separated health sync logic into reusable services
2. **Dashboard with Charts** - Visual representation of health data
3. **Event-Driven Updates** - Real-time UI updates via event bus
4. **Better Code Organization** - Clean separation of concerns

---

## 📁 New Project Structure

```
app/
├── src/
│   ├── services/
│   │   ├── healthSync.js       # Health data sync service
│   │   └── api.js              # API client configuration
│   ├── utils/
│   │   ├── sleep.js            # Async sleep utility
│   │   ├── eventBus.js         # Event emitter for app-wide events
│   │   ├── dateHelpers.js      # Date formatting utilities
│   │   └── normalizeRecord.js  # Health record normalization
│   ├── native/
│   │   └── healthConnect.js    # Health Connect wrapper
│   ├── components/
│   │   ├── ChartCard.js        # Chart display component
│   │   └── SyncButton.js       # Sync button with loading state
│   └── screens/
│       └── DashboardView.js    # Main dashboard screen
├── config.js                    # App configuration
└── App.js                       # Main app component
```

---

## 🔧 Key Components

### 1. Health Sync Service (`src/services/healthSync.js`)

**Main Functions:**

- `syncAll(options)` - Sync all health data to server
  - Preserves original behavior for special types (SleepSession, Speed, HeartRate)
  - Supports progress callbacks
  - Emits `SYNC_COMPLETED` event when done
  
- `fetchRecordsForType(recordType, {startTime, endTime})` - Fetch specific type of records
  - Used by dashboard to get today's data
  
- `fetchTodayForTypes(types)` - Fetch today's data for multiple types
  - Returns object mapping types to records

**Example Usage:**

```javascript
import { syncAll, fetchRecordsForType } from './src/services/healthSync';

// Sync all data
const result = await syncAll({
  authToken: 'your-token',
  onProgress: ({ current, total, phase }) => {
    console.log(`${current}/${total} - ${phase}`);
  }
});

// Fetch today's heart rate data
const records = await fetchRecordsForType('HeartRate', {
  startTime: isoStartOfToday(),
  endTime: isoNow()
});
```

### 2. Record Normalization (`src/utils/normalizeRecord.js`)

Converts Health Connect records into chart-friendly data points.

**Functions:**

- `normalizeRecordValue(recordType, record)` - Extract numeric value from record
- `recordToChartPoint(recordType, record, xFormat)` - Convert to {x, y} point
- `recordsToChartData(recordType, records, xFormat)` - Convert array to chart data
- `getUnitLabel(recordType)` - Get unit string for display

**Supported Record Types:**

- Vo2Max, RestingHeartRate, HeartRate
- BloodPressure (returns {systolic, diastolic})
- BodyFat, LeanBodyMass, Weight, Height
- RespiratoryRate, OxygenSaturation
- SleepSession (duration in minutes)
- Steps, Distance, Calories, etc.

**Example:**

```javascript
import { recordsToChartData, getUnitLabel } from './src/utils/normalizeRecord';

const chartData = recordsToChartData('HeartRate', records, 'time');
// Returns: [{x: '10:30 AM', y: 75}, {x: '11:00 AM', y: 78}, ...]

const unit = getUnitLabel('HeartRate'); // 'bpm'
```

### 3. Dashboard View (`src/screens/DashboardView.js`)

Visual dashboard showing today's health metrics with charts.

**Features:**

- Displays 15 different health metrics
- Automatic refresh on sync completion
- Pull-to-refresh support
- Navigation to settings

**Usage:**

```javascript
<DashboardView 
  onNavigateToSettings={() => setCurrentView('main')}
/>
```

### 4. Chart Card (`src/components/ChartCard.js`)

Renders individual metric charts using Victory Native.

**Chart Types:**

- Line charts for continuous data (Heart Rate, Weight, etc.)
- Bar charts for discrete data (Sleep, Body Fat, etc.)
- Scatter plots for cumulative data (Steps, Calories)
- Dual-line chart for Blood Pressure (systolic/diastolic)

**Props:**

- `title` - Display name
- `data` - Array of {x, y} points
- `metricKey` - Record type key
- `width` - Card width (default '100%')
- `height` - Chart height (default 200)

### 5. Event Bus (`src/utils/eventBus.js`)

Simple event emitter for app-wide communication.

**Events:**

- `SYNC_COMPLETED` - Fired when sync finishes
  - Payload: `{timestamp, total, detail?}`
- `PUSH_RECEIVED` - Fired when server pushes data
  - Payload: `{type, count}`
- `DELETE_RECEIVED` - Fired when server deletes data
  - Payload: `{type, count}`

**Example:**

```javascript
import { EventEmitter } from './src/utils/eventBus';

// Subscribe to events
const subscription = EventEmitter.addListener('SYNC_COMPLETED', (data) => {
  console.log('Sync completed at', data.timestamp);
  refreshDashboard();
});

// Cleanup
subscription.remove();

// Emit events
EventEmitter.emit('SYNC_COMPLETED', {
  timestamp: new Date().toISOString(),
  total: 150
});
```

---

## 🎨 Navigation Flow

1. **Login** (`currentView === 'login'`)
   - User enters credentials
   - On success → Navigate to Dashboard
   
2. **Dashboard** (`currentView === 'dashboard'`)
   - Shows health metrics charts
   - Sync button to fetch latest data
   - Settings button → Navigate to Settings
   
3. **Settings** (`currentView === 'main'`)
   - Configure sync interval, sync mode, etc.
   - Manual sync controls
   - Dashboard button → Navigate back to Dashboard
   - Logout → Back to Login

---

## 📊 Data Flow

### Sync Flow

```
User clicks Sync
    ↓
syncAll() in healthSync service
    ↓
Read records from Health Connect
    ↓
POST to server (bulk or one-by-one)
    ↓
Emit SYNC_COMPLETED event
    ↓
Dashboard refreshes data
```

### Dashboard Data Flow

```
Dashboard mounts
    ↓
fetchRecordsForType() for each metric
    ↓
normalizeRecord() converts to chart data
    ↓
ChartCard renders visualization
    ↓
Listen for SYNC_COMPLETED
    ↓
Auto-refresh on sync
```

### Push/Delete Flow

```
Firebase message received
    ↓
handlePush() or handleDel()
    ↓
Insert/delete in Health Connect
    ↓
Emit event (PUSH_RECEIVED/DELETE_RECEIVED)
    ↓
Dashboard auto-refreshes
```

---

## 🔑 Configuration

Edit `config.js` to change settings:

```javascript
const config = {
  // Change for production
  apiBaseUrl: 'https://api.hcgateway.shuchir.dev',
  
  // Default sync interval
  defaultSyncIntervalHours: 2,
  
  // Full 30-day sync vs incremental
  defaultFullSyncMode: true,
  
  // Sentry DSN
  sentryDsn: 'https://...',
};
```

---

## 📦 Dependencies

New dependencies added:

```json
{
  "react-native-svg": "^15.2.0",
  "victory-native": "^36.9.2"
}
```

Install with:

```bash
npm install
# or
yarn install
```

---

## 🧪 Testing

### Manual Testing

1. **Login Flow**
   - Login with credentials
   - Should navigate to Dashboard
   - Token should be set in API client

2. **Dashboard**
   - Should show "No data available" for metrics without data
   - Click Sync button
   - Charts should populate with data
   - Pull to refresh should reload data

3. **Navigation**
   - Dashboard → Settings (via Settings button)
   - Settings → Dashboard (via Dashboard button)
   - Settings → Logout → Login screen

4. **Events**
   - Manual sync should update last sync time
   - Push notification should refresh dashboard
   - Delete notification should refresh dashboard

### Unit Testing (Future)

Example test structure:

```javascript
// Test normalizeRecord
test('normalizeRecordValue extracts heart rate', () => {
  const record = { beatsPerMinute: 75, startTime: '2024-01-01T10:00:00Z' };
  const value = normalizeRecordValue('HeartRate', record);
  expect(value).toBe(75);
});

// Test healthSync
test('fetchRecordsForType returns records', async () => {
  const records = await fetchRecordsForType('Steps', {
    startTime: '2024-01-01T00:00:00Z',
    endTime: '2024-01-01T23:59:59Z'
  });
  expect(Array.isArray(records)).toBe(true);
});
```

---

## 🚀 Future Improvements

1. **Better Error Handling**
   - Retry logic with exponential backoff
   - Persist failed batches to local storage
   - Offline queue for syncs

2. **Performance**
   - Implement data caching
   - Virtualized lists for large datasets
   - Background sync optimization

3. **Features**
   - Weekly/monthly views in dashboard
   - Export data functionality
   - Detailed metric drilldown
   - Health trends and insights

4. **Code Quality**
   - Add TypeScript
   - Comprehensive unit tests
   - Integration tests
   - E2E tests

---

## 📝 Migration from Old Code

### Before (Old Sync Function)

```javascript
const sync = async () => {
  // 400+ lines of code in App.js
  // Mixed concerns
  // Hard to test
  // Difficult to reuse
};
```

### After (New Sync Service)

```javascript
import { syncAll } from './src/services/healthSync';

const handleSync = async () => {
  const result = await syncAll({
    authToken: login,
    onProgress: updateProgress
  });
};
```

**Benefits:**

- ✅ Modular and testable
- ✅ Reusable across components
- ✅ Clear separation of concerns
- ✅ Easy to maintain and extend
- ✅ Better error handling
- ✅ Progress tracking built-in

---

## 🐛 Troubleshooting

### Charts not showing data

- Check if records are being fetched (console logs)
- Verify `normalizeRecordValue` handles your record structure
- Check if `startTime` and `endTime` are correct

### Sync not working

- Verify auth token is set: `setAuthToken(token)`
- Check API base URL in `config.js`
- Look for errors in console

### Dashboard not updating after sync

- Check if `SYNC_COMPLETED` event is being emitted
- Verify event listener is set up correctly
- Check if `loadToday()` is being called

---

## 📚 Additional Resources

- [Health Connect API Docs](https://developer.android.com/health-and-fitness/guides/health-connect)
- [Victory Native Charts](https://formidable.com/open-source/victory/docs/native/)
- [React Native Navigation](https://reactnative.dev/docs/navigation)

---

## 👨‍💻 Development

### Adding a New Metric

1. Add to `METRICS` array in `DashboardView.js`
2. Add normalization logic in `normalizeRecord.js`
3. Add unit label in `getUnitLabel()`
4. Test with real data

### Adding a New Chart Type

1. Update `ChartCard.js` to handle new type
2. Import appropriate Victory component
3. Style accordingly

### Adding a New Event

1. Define event name constant
2. Emit in appropriate service/function
3. Listen in consuming component
4. Document in this guide

---

## ✅ Checklist for Production

- [ ] Update `apiBaseUrl` in `config.js`
- [ ] Test all sync scenarios
- [ ] Test navigation flows
- [ ] Verify all charts render correctly
- [ ] Check error handling
- [ ] Test on different screen sizes
- [ ] Verify offline behavior
- [ ] Test push/delete notifications
- [ ] Performance test with large datasets
- [ ] Security audit of API calls

---

**Last Updated:** October 2025
**Version:** 2.0.0


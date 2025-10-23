# Wear OS Sensor Collection Module

This module collects accelerometer data directly from a Wear OS watch and sends it to the companion phone app via the Wearable Data Layer API.

## Architecture

**Flow:** Watch IMU → 5s chunks → Data Layer → Phone RN listener → Backend `/ingest/Accelerometer`

### Components

- **`SensorService.kt`** - Foreground service that collects accelerometer data at ~50Hz
- **`DataLayerSender.kt`** - Sends chunked data to phone via Wearable Data Layer API
- **`MainActivity.kt`** - Simple UI with Start/Stop buttons

### Data Format

Chunks are sent every 5 seconds (or 250 samples, whichever comes first) in this format:

```json
{
  "deviceId": "wearos-{android_id}",
  "deviceModel": "TicWatch Pro 3",
  "platform": "wear-os",
  "sampleRateHz": 50,
  "startedAt": "2025-10-23T12:34:56.789Z",
  "samples": [
    {
      "x": -0.01,
      "y": 9.80,
      "z": 0.04,
      "tOffsetMs": 0.0,
      "ts": "2025-10-23T12:34:56.789Z"
    },
    ...
  ]
}
```

## Building & Deployment

### Prerequisites

1. **Physical Wear OS device** (recommended) or emulator
2. **Android Studio** with Wear OS emulator support
3. **ADB** for deployment
4. **Bluetooth pairing** between phone and watch

### Build the Watch APK

From the project root:

```bash
cd app/android
./gradlew :wear:assembleDebug
```

The APK will be at: `wear/build/outputs/apk/debug/wear-debug.apk`

### Install on Watch

**Option 1: Via ADB over WiFi/Bluetooth**

```bash
# Connect to watch (ensure ADB debugging enabled on watch)
adb connect <watch-ip>:5555

# Install APK
adb -s <watch-ip>:5555 install wear/build/outputs/apk/debug/wear-debug.apk
```

**Option 2: Via Android Studio**

1. Open Android Studio
2. Select `wear` module in run configuration
3. Select connected Wear OS device
4. Click Run

**Option 3: Via Wear OS companion app**

Some watches support sideloading via the companion phone app.

### Enable ADB on Wear OS

1. Go to Settings → System → About
2. Tap "Build number" 7 times to enable Developer Options
3. Go to Settings → Developer Options
4. Enable "ADB debugging"
5. Enable "Debug over WiFi" (note the IP address)

## Usage

### On the Watch

1. Launch "HC Gateway Watch" app
2. Grant sensor permissions when prompted
3. Tap "Start Sensors"
4. Watch will show "Status: Running"
5. Data collection runs in background with persistent notification

### On the Phone

1. Ensure companion phone app is running
2. Watch for logs:
   - `WearDataListener: Data changed event received`
   - `📤 Ingesting Accelerometer: 1 record(s)`
   - `✅ Accelerometer ingested: N upserts`

### Stop Collection

Tap "Stop Sensors" in the watch app, or swipe away the notification.

## Testing & Verification

### Watch Side (Logcat)

```bash
adb -s <watch> logcat -s SensorService DataLayerSender
```

Expected logs:
```
SensorService: 🚀 Starting sensor collection
SensorService: ✅ Sensor listener registered successfully
DataLayerSender: ✅ Sent accel chunk: 250 samples, path=/imu/accelerometer/1729691234567
```

### Phone Side (Logcat)

```bash
adb logcat -s WearDataListener ReactNativeJS:I
```

Expected logs:
```
WearDataListener: 📡 Data changed event received
WearDataListener: Data item path: /imu/accelerometer/1729691234567
WearDataListener: ✅ Received chunk: 4523 bytes
WearDataListener: 📤 Event sent to React Native: AccelerometerChunk
ReactNativeJS: 📤 Ingesting Accelerometer: 1 record(s)
ReactNativeJS: ✅ Accelerometer ingested: 1 upserts, 0 modified
```

### Backend Verification

Query MongoDB:

```javascript
use hh_{user_id}
db.imu_accelerometer_chunks.find({
  "tags.platform": "wear-os"
}).sort({ windowStart: -1 }).limit(5)
```

Expected fields:
- `deviceId`: `"wearos-{android_id}"`
- `tags.platform`: `"wear-os"`
- `tags.deviceModel`: `"TicWatch Pro 3"` (or similar)
- `sampleRateHz`: `50`
- `samples`: Array of `[timestamp, x, y, z]` arrays
- `n`: Sample count (~250)

## Troubleshooting

### "No accelerometer sensor available"

- Check device specifications
- Try on physical device (emulators may lack sensor)

### "Failed to send accel chunk"

- Ensure phone and watch are paired via Bluetooth
- Check phone's Bluetooth connection
- Verify both apps are installed (phone + watch)

### "React context not available"

- Ensure phone app is running in foreground or background
- Phone app may need to be opened at least once after installation

### "Permission denied: BODY_SENSORS"

- Grant permissions when prompted
- Or manually: Settings → Apps → HC Gateway Watch → Permissions → Body sensors

### Watch service stops unexpectedly

- Check battery optimization settings
- Ensure "Don't optimize" for the watch app
- Keep notification visible (don't swipe away)

## Battery Impact

- **Collection rate:** ~50 samples/sec
- **Transmission:** Every 5 seconds (~4-5 KB per chunk)
- **Battery drain:** Moderate (continuous sensor + BLE transmission)
- **Recommendation:** Stop collection when not needed

## Next Steps

### Optional Enhancements

1. **Direct cloud sync:** Send data directly from watch to backend (requires WiFi/LTE on watch)
2. **Offline buffering:** Store chunks locally on watch when phone disconnected
3. **Gyroscope:** Add gyroscope sensor collection
4. **Heart rate:** Add heart rate sensor collection
5. **Configuration UI:** Allow adjusting sample rate and chunk duration
6. **Battery monitoring:** Auto-pause when battery low

## File Structure

```
wear/
├── build.gradle
├── proguard-rules.pro
├── src/main/
│   ├── AndroidManifest.xml
│   ├── java/com/echavarrias/hcgateway/wear/
│   │   ├── MainActivity.kt
│   │   ├── SensorService.kt
│   │   └── DataLayerSender.kt
│   └── res/
│       ├── layout/activity_main.xml
│       ├── values/strings.xml
│       └── mipmap-*/ic_launcher.png
└── README.md (this file)
```

## Related Files

**Phone app:**
- `app/src/main/java/.../wear/WearDataListenerService.kt` - Receives data from watch
- `app/src/main/AndroidManifest.xml` - Registers listener service
- `app/src/hooks/useSensorStream.js` - React Native hook for processing chunks
- `app/src/services/ingestService.js` - Uploads to backend

**Backend:**
- `api/routes/ingest.py` - `/ingest/Accelerometer` endpoint
- MongoDB collection: `hh_{user_id}.imu_accelerometer_chunks`

## Support

For issues or questions, check:
1. Logcat output on both watch and phone
2. Bluetooth connection status
3. Backend API health (`/ingest/health`)
4. MongoDB connection and user database existence


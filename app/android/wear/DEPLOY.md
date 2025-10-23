# Deploy Wear OS App - Step by Step

## Quick Deploy (Recommended)

```bash
cd app/android/wear
./build-and-install.sh
```

This script will:
1. Build the debug APK
2. Check for connected devices
3. Install to your watch
4. Show next steps

## Manual Deploy

### Step 1: Enable ADB on Watch

1. On watch: **Settings** → **System** → **About**
2. Tap **Build number** 7 times
3. Go back to **Settings** → **Developer options**
4. Enable **ADB debugging**
5. Enable **Debug over WiFi**
6. Note the IP address (e.g., `192.168.1.100`)

### Step 2: Connect via ADB

```bash
adb connect 192.168.1.100:5555
```

Expected output:
```
connected to 192.168.1.100:5555
```

Verify:
```bash
adb devices
```

Should show:
```
List of devices attached
192.168.1.100:5555    device
```

### Step 3: Build APK

```bash
cd app/android
./gradlew :wear:assembleDebug
```

APK location: `wear/build/outputs/apk/debug/wear-debug.apk`

### Step 4: Install

```bash
adb -s 192.168.1.100:5555 install -r wear/build/outputs/apk/debug/wear-debug.apk
```

Expected output:
```
Performing Streamed Install
Success
```

### Step 5: Launch & Test

1. On watch: Open **HC Gateway Watch**
2. Grant **Body sensors** permission
3. Grant **Notifications** permission (Android 13+)
4. Tap **Start Sensors**
5. Verify status shows **"Status: Running"**

### Step 6: Monitor Logs

**Watch logs:**
```bash
adb -s 192.168.1.100:5555 logcat -s SensorService DataLayerSender
```

Expected output every 5 seconds:
```
SensorService: 📦 Sending chunk: 250 samples
DataLayerSender: ✅ Sent accel chunk: 250 samples, path=/imu/accelerometer/1729691234567
```

**Phone logs:**
```bash
adb logcat -s WearDataListener ReactNativeJS:I
```

Expected output:
```
WearDataListener: 📡 Data changed event received
WearDataListener: Data item path: /imu/accelerometer/1729691234567
WearDataListener: ✅ Received chunk: 4523 bytes
WearDataListener: 📤 Event sent to React Native: AccelerometerChunk
ReactNativeJS: 📤 Ingesting Accelerometer: 1 record(s)
ReactNativeJS: ✅ Accelerometer ingested: 1 upserts, 0 modified
```

## Troubleshooting

### ADB Connection Issues

**Problem:** `failed to connect to 192.168.1.100:5555`

**Solutions:**
1. Ensure watch and computer on same WiFi network
2. Disable/re-enable Debug over WiFi on watch
3. Try USB connection instead (requires compatible cable)
4. Restart ADB: `adb kill-server && adb start-server`

### Build Issues

**Problem:** `FAILURE: Build failed with an exception`

**Solutions:**
1. Clean build: `./gradlew clean`
2. Invalidate caches: Android Studio → File → Invalidate Caches
3. Check Gradle version compatibility
4. Ensure Kotlin plugin is up to date

### Permission Issues

**Problem:** App crashes on startup or can't access sensors

**Solutions:**
1. Manually grant permissions: Watch Settings → Apps → HC Gateway Watch → Permissions
2. Check manifest has all required permissions
3. Target SDK compatibility (should be 34)

### Data Not Reaching Phone

**Problem:** Watch sends data but phone doesn't receive

**Solutions:**
1. Ensure watch and phone are paired via Bluetooth
2. Check phone's Bluetooth is enabled
3. Verify WearDataListenerService is registered in phone's manifest
4. Restart phone app
5. Check phone logcat for errors

### Data Not Reaching Backend

**Problem:** Phone receives data but backend doesn't

**Solutions:**
1. Check phone has internet connection
2. Verify auth token is valid
3. Check backend API URL in config
4. Monitor phone logcat for HTTP errors
5. Test backend health: `curl https://your-api.com/ingest/health`

## Verification Checklist

- [ ] Watch shows "Status: Running"
- [ ] Watch logcat shows "Sent accel chunk" every 5 seconds
- [ ] Phone logcat shows "Received chunk" messages
- [ ] Phone logcat shows "Ingesting Accelerometer" messages
- [ ] Backend MongoDB has new documents with `platform: "wear-os"`

## Clean Reinstall

If you need to start fresh:

```bash
# Uninstall from watch
adb -s 192.168.1.100:5555 uninstall com.echavarrias.hcgateway.wear

# Clean build
cd app/android
./gradlew clean
./gradlew :wear:assembleDebug

# Reinstall
adb -s 192.168.1.100:5555 install wear/build/outputs/apk/debug/wear-debug.apk
```

## Production Build

For release/production:

```bash
# Build release APK
./gradlew :wear:assembleRelease

# Sign APK (requires keystore)
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore your-keystore.jks \
  wear/build/outputs/apk/release/wear-release-unsigned.apk \
  your-key-alias

# Align APK
zipalign -v 4 \
  wear/build/outputs/apk/release/wear-release-unsigned.apk \
  wear/build/outputs/apk/release/wear-release.apk

# Install
adb install wear/build/outputs/apk/release/wear-release.apk
```

## Next Steps After Deploy

1. **Test basic flow:** Start sensors → Check logs → Verify backend
2. **Test battery impact:** Monitor watch battery over 1 hour
3. **Test disconnection:** Disable Bluetooth, verify behavior
4. **Test reconnection:** Re-enable Bluetooth, check data resumes
5. **Test phone app restart:** Kill and restart phone app
6. **Test watch app restart:** Force stop and reopen watch app

## Support

If you encounter issues:

1. Check all logs (watch + phone)
2. Verify Bluetooth connection
3. Test backend API health
4. Review troubleshooting section
5. Check GitHub issues or documentation

---

**Ready to deploy?** Run `./build-and-install.sh` and follow the prompts!


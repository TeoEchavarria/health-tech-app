#!/bin/bash
# Convenience script to build and install Wear OS app

set -e

echo "🏗️  Building Wear OS APK..."
cd "$(dirname "$0")/.."
./gradlew :wear:assembleDebug

APK_PATH="wear/build/outputs/apk/debug/wear-debug.apk"

if [ ! -f "$APK_PATH" ]; then
  echo "❌ APK not found at $APK_PATH"
  exit 1
fi

echo "✅ APK built successfully: $APK_PATH"
echo ""

# Check if watch is connected
if ! adb devices | grep -q "device$"; then
  echo "⚠️  No device connected via ADB"
  echo ""
  echo "To connect to your watch:"
  echo "1. Enable Developer Options on watch (tap Build number 7 times)"
  echo "2. Enable 'ADB debugging' and 'Debug over WiFi'"
  echo "3. Note the IP address shown"
  echo "4. Run: adb connect <watch-ip>:5555"
  echo ""
  exit 1
fi

# List connected devices
echo "📱 Connected devices:"
adb devices
echo ""

# Prompt for device if multiple
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -gt 1 ]; then
  echo "Multiple devices connected. Please specify which one:"
  read -p "Device ID (or press Enter for default): " DEVICE_ID
  if [ -n "$DEVICE_ID" ]; then
    ADB_OPTS="-s $DEVICE_ID"
  else
    ADB_OPTS=""
  fi
else
  ADB_OPTS=""
fi

echo "📦 Installing APK to watch..."
adb $ADB_OPTS install -r "$APK_PATH"

echo ""
echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Open 'HC Gateway Watch' on your watch"
echo "2. Grant sensor permissions"
echo "3. Tap 'Start Sensors'"
echo ""
echo "🔍 Monitor logs with:"
echo "   adb $ADB_OPTS logcat -s SensorService DataLayerSender"
echo ""


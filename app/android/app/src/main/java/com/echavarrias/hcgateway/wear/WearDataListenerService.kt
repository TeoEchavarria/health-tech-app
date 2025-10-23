package com.echavarrias.hcgateway.wear

import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService

/**
 * Service that listens for sensor data from the companion Wear OS watch.
 * Forwards accelerometer chunks to React Native via event emitter.
 */
class WearDataListenerService : WearableListenerService() {

    companion object {
        private const val TAG = "WearDataListener"
        private const val IMU_PATH_PREFIX = "/imu/"
        private const val EVENT_NAME = "AccelerometerChunk"
    }

    override fun onDataChanged(dataEvents: DataEventBuffer) {
        Log.d(TAG, "📡 Data changed event received")

        dataEvents.use { events ->
            for (event in events) {
                // Only process new data items
                if (event.type != DataEvent.TYPE_CHANGED) {
                    continue
                }

                val path = event.dataItem.uri.path
                Log.d(TAG, "Data item path: $path")

                // Filter for IMU sensor data
                if (path == null || !path.startsWith(IMU_PATH_PREFIX)) {
                    continue
                }

                try {
                    // Extract payload bytes from DataItem
                    val payloadBytes = event.dataItem.data
                    
                    if (payloadBytes == null) {
                        Log.w(TAG, "⚠️ No data in DataItem at path: $path")
                        continue
                    }

                    // Convert to JSON string
                    val jsonString = String(payloadBytes, Charsets.UTF_8)
                    
                    Log.d(TAG, "✅ Received chunk: ${payloadBytes.size} bytes")
                    Log.d(TAG, "Preview: ${jsonString.take(200)}...")

                    // Forward to React Native
                    sendEventToReactNative(EVENT_NAME, jsonString)

                } catch (e: Exception) {
                    Log.e(TAG, "❌ Error processing data item", e)
                }
            }
        }
    }

    /**
     * Send event to React Native JavaScript context.
     */
    private fun sendEventToReactNative(eventName: String, data: String) {
        try {
            val reactContext = getReactContext()
            
            if (reactContext == null) {
                Log.w(TAG, "⚠️ React context not available, cannot send event")
                return
            }

            if (!reactContext.hasActiveReactInstance()) {
                Log.w(TAG, "⚠️ React instance not active")
                return
            }

            // Emit event to JavaScript
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, data)

            Log.d(TAG, "📤 Event sent to React Native: $eventName")

        } catch (e: Exception) {
            Log.e(TAG, "❌ Error sending event to React Native", e)
        }
    }

    /**
     * Get the current React context from the application.
     */
    private fun getReactContext(): ReactContext? {
        return try {
            val application = application
            
            if (application is ReactApplication) {
                val reactNativeHost = application.reactNativeHost
                val reactInstanceManager = reactNativeHost.reactInstanceManager
                reactInstanceManager.currentReactContext
            } else {
                Log.e(TAG, "Application is not a ReactApplication")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting React context", e)
            null
        }
    }
}


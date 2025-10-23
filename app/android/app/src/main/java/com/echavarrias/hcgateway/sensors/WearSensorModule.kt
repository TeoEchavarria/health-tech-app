package com.echavarrias.hcgateway.sensors

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Native module for accessing Wear OS sensors (accelerometer, gyroscope, etc.)
 * Provides real-time sensor data to React Native
 */
class WearSensorModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    private val sensorManager: SensorManager = reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelerometer: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    
    // Sample collection
    private val accelerometerSamples = ConcurrentLinkedQueue<AccelSample>()
    private val gyroscopeSamples = ConcurrentLinkedQueue<GyroSample>()
    
    // Configuration
    private var sampleRateHz = 50
    private var chunkDurationMs = 5000L
    private var isAccelerometerActive = false
    private var isGyroscopeActive = false
    
    // Chunk timing
    private var chunkStartTime = 0L
    private var chunkStartMonoNs = 0L
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    override fun getName(): String = "WearSensorModule"

    /**
     * Start accelerometer streaming
     */
    @ReactMethod
    fun startAccelerometer(sampleRateHz: Int, promise: Promise) {
        try {
            this.sampleRateHz = sampleRateHz
            this.chunkDurationMs = ((1000.0 / sampleRateHz) * 250.0).toLong() // ~250 samples per chunk
            
            if (accelerometer == null) {
                promise.reject("NO_ACCELEROMETER", "Accelerometer sensor not available")
                return
            }
            
            val delay = when {
                sampleRateHz >= 100 -> SensorManager.SENSOR_DELAY_FASTEST
                sampleRateHz >= 50 -> SensorManager.SENSOR_DELAY_GAME
                sampleRateHz >= 20 -> SensorManager.SENSOR_DELAY_UI
                else -> SensorManager.SENSOR_DELAY_NORMAL
            }
            
            val success = sensorManager.registerListener(this, accelerometer, delay)
            
            if (success) {
                isAccelerometerActive = true
                accelerometerSamples.clear()
                chunkStartTime = System.currentTimeMillis()
                chunkStartMonoNs = SystemClock.elapsedRealtimeNanos()
                
                promise.resolve(true)
                sendEvent("AccelerometerStarted", WritableNativeMap())
            } else {
                promise.reject("REGISTRATION_FAILED", "Failed to register accelerometer listener")
            }
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }

    /**
     * Stop accelerometer streaming
     */
    @ReactMethod
    fun stopAccelerometer(promise: Promise) {
        try {
            if (isAccelerometerActive) {
                sensorManager.unregisterListener(this, accelerometer)
                isAccelerometerActive = false
                
                // Send any remaining samples as final chunk
                if (accelerometerSamples.isNotEmpty()) {
                    sendAccelerometerChunk(true)
                }
                
                promise.resolve(true)
                sendEvent("AccelerometerStopped", WritableNativeMap())
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /**
     * Start gyroscope streaming
     */
    @ReactMethod
    fun startGyroscope(sampleRateHz: Int, promise: Promise) {
        try {
            this.sampleRateHz = sampleRateHz
            
            if (gyroscope == null) {
                promise.reject("NO_GYROSCOPE", "Gyroscope sensor not available")
                return
            }
            
            val delay = when {
                sampleRateHz >= 100 -> SensorManager.SENSOR_DELAY_FASTEST
                sampleRateHz >= 50 -> SensorManager.SENSOR_DELAY_GAME
                sampleRateHz >= 20 -> SensorManager.SENSOR_DELAY_UI
                else -> SensorManager.SENSOR_DELAY_NORMAL
            }
            
            val success = sensorManager.registerListener(this, gyroscope, delay)
            
            if (success) {
                isGyroscopeActive = true
                gyroscopeSamples.clear()
                
                promise.resolve(true)
                sendEvent("GyroscopeStarted", WritableNativeMap())
            } else {
                promise.reject("REGISTRATION_FAILED", "Failed to register gyroscope listener")
            }
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }

    /**
     * Stop gyroscope streaming
     */
    @ReactMethod
    fun stopGyroscope(promise: Promise) {
        try {
            if (isGyroscopeActive) {
                sensorManager.unregisterListener(this, gyroscope)
                isGyroscopeActive = false
                
                promise.resolve(true)
                sendEvent("GyroscopeStopped", WritableNativeMap())
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /**
     * Get sensor availability status
     */
    @ReactMethod
    fun getSensorStatus(promise: Promise) {
        val status = WritableNativeMap().apply {
            putBoolean("accelerometer", accelerometer != null)
            putBoolean("gyroscope", gyroscope != null)
            putBoolean("accelerometerActive", isAccelerometerActive)
            putBoolean("gyroscopeActive", isGyroscopeActive)
            putInt("sampleRateHz", sampleRateHz)
            putDouble("chunkDurationMs", chunkDurationMs.toDouble())
        }
        promise.resolve(status)
    }

    /**
     * Handle sensor events
     */
    override fun onSensorChanged(event: SensorEvent?) {
        event?.let { sensorEvent ->
            when (sensorEvent.sensor.type) {
                Sensor.TYPE_ACCELEROMETER -> {
                    if (isAccelerometerActive) {
                        // event.timestamp is in nanoseconds since boot (monotonic)
                        val tOffsetMs = (sensorEvent.timestamp - chunkStartMonoNs) / 1_000_000.0
                        
                        // Calculate wall-clock timestamp
                        val bootTimeMs = System.currentTimeMillis() - SystemClock.elapsedRealtime()
                        val wallClockMs = bootTimeMs + (sensorEvent.timestamp / 1_000_000L)
                        
                        val sample = AccelSample(
                            x = sensorEvent.values[0].toDouble(),
                            y = sensorEvent.values[1].toDouble(),
                            z = sensorEvent.values[2].toDouble(),
                            tOffsetMs = tOffsetMs,
                            timestamp = wallClockMs
                        )
                        
                        accelerometerSamples.offer(sample)
                        
                        // Send chunk when we have enough samples or time has passed
                        val elapsedMs = (SystemClock.elapsedRealtimeNanos() - chunkStartMonoNs) / 1_000_000
                        if (accelerometerSamples.size >= 250 || elapsedMs >= chunkDurationMs) {
                            sendAccelerometerChunk()
                        }
                    }
                }
                
                Sensor.TYPE_GYROSCOPE -> {
                    if (isGyroscopeActive) {
                        // event.timestamp is in nanoseconds since boot (monotonic)
                        val tOffsetMs = (sensorEvent.timestamp - chunkStartMonoNs) / 1_000_000.0
                        
                        // Calculate wall-clock timestamp
                        val bootTimeMs = System.currentTimeMillis() - SystemClock.elapsedRealtime()
                        val wallClockMs = bootTimeMs + (sensorEvent.timestamp / 1_000_000L)
                        
                        val sample = GyroSample(
                            x = sensorEvent.values[0].toDouble(),
                            y = sensorEvent.values[1].toDouble(),
                            z = sensorEvent.values[2].toDouble(),
                            tOffsetMs = tOffsetMs,
                            timestamp = wallClockMs
                        )
                        
                        gyroscopeSamples.offer(sample)
                        
                        // Send chunk when we have enough samples
                        if (gyroscopeSamples.size >= 250) {
                            sendGyroscopeChunk()
                        }
                    }
                }
            }
        }
    }

    /**
     * Send accelerometer chunk to React Native
     */
    private fun sendAccelerometerChunk(isFinal: Boolean = false) {
        if (accelerometerSamples.isEmpty()) return
        
        val samples = mutableListOf<WritableMap>()
        val chunkStart = chunkStartTime
        
        while (accelerometerSamples.isNotEmpty()) {
            val sample = accelerometerSamples.poll() ?: break
            
            val sampleMap = WritableNativeMap().apply {
                putDouble("x", sample.x)
                putDouble("y", sample.y)
                putDouble("z", sample.z)
                putDouble("tOffsetMs", sample.tOffsetMs)
                putString("ts", dateFormat.format(Date(sample.timestamp)))
            }
            
            samples.add(sampleMap)
        }
        
        val chunk = WritableNativeMap().apply {
            putString("deviceId", getDeviceId())
            putString("deviceModel", getDeviceModel())
            putString("platform", "wear-os")
            putInt("sampleRateHz", sampleRateHz)
            putString("startedAt", dateFormat.format(Date(chunkStart)))
            putArray("samples", WritableNativeArray().apply {
                samples.forEach { pushMap(it) }
            })
        }
        
        sendEvent("AccelerometerChunk", chunk)
        
        // Reset both clocks for next chunk
        if (!isFinal) {
            chunkStartTime = System.currentTimeMillis()
            chunkStartMonoNs = SystemClock.elapsedRealtimeNanos()
        }
    }

    /**
     * Send gyroscope chunk to React Native
     */
    private fun sendGyroscopeChunk() {
        if (gyroscopeSamples.isEmpty()) return
        
        val samples = mutableListOf<WritableMap>()
        val chunkStart = chunkStartTime
        
        while (gyroscopeSamples.isNotEmpty()) {
            val sample = gyroscopeSamples.poll() ?: break
            
            val sampleMap = WritableNativeMap().apply {
                putDouble("x", sample.x)
                putDouble("y", sample.y)
                putDouble("z", sample.z)
                putDouble("tOffsetMs", sample.tOffsetMs)
                putString("ts", dateFormat.format(Date(sample.timestamp)))
            }
            
            samples.add(sampleMap)
        }
        
        val chunk = WritableNativeMap().apply {
            putString("deviceId", getDeviceId())
            putString("deviceModel", getDeviceModel())
            putString("platform", "wear-os")
            putInt("sampleRateHz", sampleRateHz)
            putString("startedAt", dateFormat.format(Date(chunkStart)))
            putArray("samples", WritableNativeArray().apply {
                samples.forEach { pushMap(it) }
            })
        }
        
        sendEvent("GyroscopeChunk", chunk)
        
        // Reset both clocks for next chunk
        chunkStartTime = System.currentTimeMillis()
        chunkStartMonoNs = SystemClock.elapsedRealtimeNanos()
    }

    /**
     * Send event to React Native
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Get device ID - stable per-device identifier
     */
    private fun getDeviceId(): String {
        val androidId = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        return "wearos-$androidId"
    }

    /**
     * Get device model - human-readable device info
     */
    private fun getDeviceModel(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL}"
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not used
    }
}

/**
 * Data class for accelerometer samples
 */
data class AccelSample(
    val x: Double,
    val y: Double,
    val z: Double,
    val tOffsetMs: Double,
    val timestamp: Long
)

/**
 * Data class for gyroscope samples
 */
data class GyroSample(
    val x: Double,
    val y: Double,
    val z: Double,
    val tOffsetMs: Double,
    val timestamp: Long
)

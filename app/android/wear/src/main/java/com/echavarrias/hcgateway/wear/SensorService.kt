package com.echavarrias.hcgateway.wear

import android.app.*
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that continuously collects accelerometer data from the watch sensors.
 * Chunks samples into ~5 second windows and sends them to the companion phone.
 */
class SensorService : Service(), SensorEventListener {

    companion object {
        private const val TAG = "SensorService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "sensor_collection_channel"
        
        // Chunking parameters
        private const val CHUNK_DURATION_MS = 5000L  // 5 seconds
        private const val MAX_SAMPLES_PER_CHUNK = 300  // Safety limit
        
        // Actions
        const val ACTION_START_COLLECTION = "com.echavarrias.hcgateway.wear.START_COLLECTION"
        const val ACTION_STOP_COLLECTION = "com.echavarrias.hcgateway.wear.STOP_COLLECTION"
    }

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var wakeLock: PowerManager.WakeLock? = null
    
    // Data Layer sender
    private val sender by lazy { DataLayerSender(this) }
    
    // Current chunk buffer
    private val currentChunk = ArrayList<Sample>(MAX_SAMPLES_PER_CHUNK)
    
    // Timing trackers
    private var chunkStartMonoNs = 0L  // Monotonic time (SystemClock.elapsedRealtimeNanos)
    private var chunkStartWallMs = 0L  // Wall clock time (System.currentTimeMillis)
    
    // Stats
    private var totalChunksSent = 0
    private var totalSamplesCollected = 0
    
    private var isCollecting = false

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        
        // Initialize sensor manager
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        
        if (accelerometer == null) {
            Log.e(TAG, "❌ No accelerometer sensor available on this device!")
            stopSelf()
            return
        }
        
        // Acquire wake lock to keep CPU running
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "HCGateway::SensorWakeLock"
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_COLLECTION -> startCollection()
            ACTION_STOP_COLLECTION -> stopCollection()
            else -> startCollection()  // Default action
        }
        
        return START_STICKY
    }

    private fun startCollection() {
        if (isCollecting) {
            Log.d(TAG, "Already collecting, ignoring start request")
            return
        }
        
        Log.d(TAG, "🚀 Starting sensor collection")
        
        // Start foreground service with notification
        createNotificationChannel()
        val notification = buildNotification()
        startForeground(NOTIFICATION_ID, notification)
        
        // Acquire wake lock
        wakeLock?.acquire(10 * 60 * 1000L /* 10 minutes max */)
        
        // Register sensor listener
        // SENSOR_DELAY_GAME = ~50Hz, good balance of frequency and battery
        val registered = sensorManager.registerListener(
            this,
            accelerometer,
            SensorManager.SENSOR_DELAY_GAME
        )
        
        if (registered) {
            isCollecting = true
            
            // Initialize timing
            chunkStartMonoNs = SystemClock.elapsedRealtimeNanos()
            chunkStartWallMs = System.currentTimeMillis()
            
            Log.d(TAG, "✅ Sensor listener registered successfully")
        } else {
            Log.e(TAG, "❌ Failed to register sensor listener")
            stopSelf()
        }
    }

    private fun stopCollection() {
        if (!isCollecting) {
            Log.d(TAG, "Not collecting, ignoring stop request")
            return
        }
        
        Log.d(TAG, "🛑 Stopping sensor collection")
        
        isCollecting = false
        
        // Unregister sensor listener
        sensorManager.unregisterListener(this)
        
        // Send any remaining samples in buffer
        if (currentChunk.isNotEmpty()) {
            sendCurrentChunk()
        }
        
        // Release wake lock
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        
        // Stop foreground service
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        
        Log.d(TAG, "📊 Final stats: $totalChunksSent chunks, $totalSamplesCollected samples")
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!isCollecting || event.sensor.type != Sensor.TYPE_ACCELEROMETER) {
            return
        }
        
        // Calculate timestamp offset from chunk start
        val elapsedNs = event.timestamp - chunkStartMonoNs
        val tOffsetMs = elapsedNs / 1_000_000.0  // Convert nanoseconds to milliseconds
        
        // Calculate wall clock timestamp
        // event.timestamp is in nanoseconds from boot (monotonic time)
        // We need to map it to wall clock time
        val bootToWallOffsetMs = System.currentTimeMillis() - SystemClock.elapsedRealtime()
        val wallClockMs = bootToWallOffsetMs + (event.timestamp / 1_000_000)
        
        // Create sample
        val sample = Sample(
            x = event.values[0],
            y = event.values[1],
            z = event.values[2],
            tOffsetMs = tOffsetMs,
            tsMs = wallClockMs
        )
        
        currentChunk.add(sample)
        totalSamplesCollected++
        
        // Check if chunk is ready to send
        val elapsedMs = elapsedNs / 1_000_000
        if (elapsedMs >= CHUNK_DURATION_MS || currentChunk.size >= MAX_SAMPLES_PER_CHUNK) {
            sendCurrentChunk()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Log accuracy changes for debugging
        val accuracyStr = when (accuracy) {
            SensorManager.SENSOR_STATUS_ACCURACY_HIGH -> "HIGH"
            SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM -> "MEDIUM"
            SensorManager.SENSOR_STATUS_ACCURACY_LOW -> "LOW"
            SensorManager.SENSOR_STATUS_UNRELIABLE -> "UNRELIABLE"
            else -> "UNKNOWN"
        }
        Log.d(TAG, "Sensor accuracy changed: $accuracyStr")
    }

    private fun sendCurrentChunk() {
        if (currentChunk.isEmpty()) {
            return
        }
        
        Log.d(TAG, "📦 Sending chunk: ${currentChunk.size} samples")
        
        // Send via Data Layer
        sender.sendAccelChunk(
            startWallMs = chunkStartWallMs,
            sampleRateHz = 50,  // Approximate rate for SENSOR_DELAY_GAME
            samples = currentChunk.toList()  // Copy to avoid concurrent modification
        )
        
        totalChunksSent++
        
        // Clear buffer and reset timing for next chunk
        currentChunk.clear()
        chunkStartMonoNs = SystemClock.elapsedRealtimeNanos()
        chunkStartWallMs = System.currentTimeMillis()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.notification_channel_desc)
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        // Intent to open the app when tapping notification
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(android.R.drawable.ic_menu_compass)  // Use system icon for now
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        
        // Cleanup
        if (isCollecting) {
            stopCollection()
        }
    }
}


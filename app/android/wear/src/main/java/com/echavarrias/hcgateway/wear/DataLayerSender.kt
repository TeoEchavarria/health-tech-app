package com.echavarrias.hcgateway.wear

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

/**
 * Handles sending sensor data chunks to the companion phone via Wearable Data Layer API.
 */
class DataLayerSender(private val context: Context) {

    private val TAG = "DataLayerSender"
    private val dataClient = Wearable.getDataClient(context)
    
    // ISO 8601 date formatter for backend compatibility
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }

    /**
     * Send an accelerometer chunk to the phone via Data Layer API.
     * 
     * @param startWallMs Wall clock timestamp (System.currentTimeMillis) when chunk started
     * @param sampleRateHz Approximate sample rate in Hz
     * @param samples List of accelerometer samples
     */
    fun sendAccelChunk(startWallMs: Long, sampleRateHz: Int, samples: List<Sample>) {
        try {
            // Build samples array
            val samplesArray = JSONArray()
            samples.forEach { sample ->
                val sampleObj = JSONObject().apply {
                    put("x", sample.x.toDouble())
                    put("y", sample.y.toDouble())
                    put("z", sample.z.toDouble())
                    put("tOffsetMs", sample.tOffsetMs)
                    put("ts", dateFormat.format(Date(sample.tsMs)))
                }
                samplesArray.put(sampleObj)
            }

            // Build chunk payload matching backend AccelChunk schema
            val payload = JSONObject().apply {
                put("deviceId", getDeviceId())
                put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}")
                put("platform", "wear-os")
                put("sampleRateHz", sampleRateHz)
                put("startedAt", dateFormat.format(Date(startWallMs)))
                put("samples", samplesArray)
            }

            // Convert to bytes for Data Layer
            val payloadBytes = payload.toString().toByteArray(Charsets.UTF_8)

            // Create PutDataRequest with unique path to avoid conflicts
            // Use timestamp to ensure uniqueness (Data Layer deduplicates identical paths)
            val path = "/imu/accelerometer/${System.currentTimeMillis()}"
            val request = PutDataRequest.create(path).apply {
                data = payloadBytes
            }

            // Send asynchronously
            dataClient.putDataItem(request)
                .addOnSuccessListener {
                    Log.d(TAG, "✅ Sent accel chunk: ${samples.size} samples, path=$path")
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "❌ Failed to send accel chunk: ${e.message}", e)
                }

        } catch (e: Exception) {
            Log.e(TAG, "Error building accel chunk payload", e)
        }
    }

    /**
     * Get unique device identifier for this watch.
     */
    private fun getDeviceId(): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
        return "wearos-$androidId"
    }
}

/**
 * Represents a single accelerometer sample with timestamp.
 */
data class Sample(
    val x: Float,
    val y: Float,
    val z: Float,
    val tOffsetMs: Double,  // Offset from chunk start in milliseconds
    val tsMs: Long          // Absolute wall clock timestamp
)


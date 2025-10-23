package com.echavarrias.hcgateway.wear

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * Main activity for the Wear OS watch app.
 * Provides simple UI to start/stop sensor collection.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
        private const val REQUEST_PERMISSIONS = 1001
    }

    private lateinit var statusText: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    
    private var isServiceRunning = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        statusText = findViewById(R.id.statusText)
        startButton = findViewById(R.id.startButton)
        stopButton = findViewById(R.id.stopButton)
        
        setupButtons()
        checkPermissions()
    }

    private fun setupButtons() {
        startButton.setOnClickListener {
            if (checkPermissions()) {
                startSensorCollection()
            }
        }
        
        stopButton.setOnClickListener {
            stopSensorCollection()
        }
        
        updateUI()
    }

    private fun checkPermissions(): Boolean {
        val requiredPermissions = mutableListOf(
            Manifest.permission.BODY_SENSORS
        )
        
        // Add notification permission for Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requiredPermissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        
        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        
        if (missingPermissions.isNotEmpty()) {
            Log.d(TAG, "Requesting permissions: $missingPermissions")
            ActivityCompat.requestPermissions(
                this,
                missingPermissions.toTypedArray(),
                REQUEST_PERMISSIONS
            )
            return false
        }
        
        return true
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == REQUEST_PERMISSIONS) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            
            if (allGranted) {
                Log.d(TAG, "✅ All permissions granted")
                updateUI()
            } else {
                Log.e(TAG, "❌ Some permissions denied")
                statusText.text = "Permissions Required"
            }
        }
    }

    private fun startSensorCollection() {
        Log.d(TAG, "🚀 Starting sensor collection service")
        
        val intent = Intent(this, SensorService::class.java).apply {
            action = SensorService.ACTION_START_COLLECTION
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        
        isServiceRunning = true
        updateUI()
    }

    private fun stopSensorCollection() {
        Log.d(TAG, "🛑 Stopping sensor collection service")
        
        val intent = Intent(this, SensorService::class.java).apply {
            action = SensorService.ACTION_STOP_COLLECTION
        }
        startService(intent)
        
        isServiceRunning = false
        updateUI()
    }

    private fun updateUI() {
        if (isServiceRunning) {
            statusText.text = getString(R.string.sensor_running)
            startButton.isEnabled = false
            stopButton.isEnabled = true
        } else {
            statusText.text = getString(R.string.sensor_stopped)
            startButton.isEnabled = checkPermissions()
            stopButton.isEnabled = false
        }
    }

    override fun onResume() {
        super.onResume()
        updateUI()
    }
}


import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, NativeModules } from 'react-native';
import { useAccelerometer, useOfflineQueue } from '../hooks/useSensorStream';
import { checkHealth } from '../services/api';

/**
 * Comprehensive diagnostic panel for accelerometer streaming
 * Displays native module status, streaming controls, real-time stats, and backend health
 */
export default function AccelerometerDiagnostics() {
  const {
    isStreaming,
    lastChunk,
    error,
    stats,
    start,
    stop,
    isAccelerometerEnabled,
  } = useAccelerometer({
    autoSync: true,
    offlineQueue: true,
  });

  const { pendingCount, isProcessing, flush } = useOfflineQueue();

  // Native module availability
  const [moduleAvailable, setModuleAvailable] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState({ id: null, model: null });
  
  // Backend health
  const [backendHealthy, setBackendHealthy] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // UI state
  const [expanded, setExpanded] = useState(true);

  // Check native module availability on mount
  useEffect(() => {
    const checkModule = async () => {
      try {
        const { WearSensorModule } = NativeModules;
        const available = WearSensorModule !== undefined && WearSensorModule !== null;
        setModuleAvailable(available);

        if (available && WearSensorModule.getDeviceInfo) {
          try {
            const info = await WearSensorModule.getDeviceInfo();
            setDeviceInfo(info || { id: null, model: null });
          } catch (err) {
            console.log('Could not get device info:', err.message);
          }
        }
      } catch (err) {
        console.error('Error checking native module:', err);
        setModuleAvailable(false);
      }
    };

    checkModule();
  }, []);

  // Check backend health periodically
  useEffect(() => {
    const checkBackendHealth = async () => {
      setCheckingHealth(true);
      try {
        const response = await checkHealth();
        setBackendHealthy(response.status === 'ok');
      } catch (err) {
        console.error('Health check failed:', err);
        setBackendHealthy(false);
      } finally {
        setCheckingHealth(false);
      }
    };

    // Check immediately
    checkBackendHealth();

    // Check every 30 seconds
    const interval = setInterval(checkBackendHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleToggleStreaming = async () => {
    try {
      if (isStreaming) {
        await stop();
      } else {
        await start();
      }
    } catch (err) {
      console.error('Error toggling streaming:', err);
    }
  };

  const handleFlushQueue = async () => {
    try {
      await flush();
    } catch (err) {
      console.error('Error flushing queue:', err);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const getStatusColor = (status) => {
    if (status === null) return '#6B7280'; // Gray - unknown
    return status ? '#10B981' : '#EF4444'; // Green or Red
  };

  const getStatusText = (status) => {
    if (status === null) return 'Unknown';
    return status ? 'Available' : 'Unavailable';
  };

  return (
    <View style={styles.container}>
      {/* Header with expand/collapse */}
      <TouchableOpacity 
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Text style={styles.headerIcon}>🔬</Text>
          <Text style={styles.headerTitle}>Sensor Diagnostics</Text>
        </View>
        <Text style={styles.expandIcon}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.content}>
          {/* Native Module Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Native Module</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(moduleAvailable) }]} />
              <Text style={styles.statusLabel}>WearSensorModule:</Text>
              <Text style={[styles.statusValue, { color: getStatusColor(moduleAvailable) }]}>
                {getStatusText(moduleAvailable)}
              </Text>
            </View>
            {deviceInfo.id && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Device ID:</Text>
                  <Text style={styles.infoValue}>{deviceInfo.id}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Device Model:</Text>
                  <Text style={styles.infoValue}>{deviceInfo.model}</Text>
                </View>
              </>
            )}
          </View>

          <View style={styles.divider} />

          {/* Streaming Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Streaming Status</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: isStreaming ? '#10B981' : '#6B7280' }]} />
              <Text style={styles.statusLabel}>State:</Text>
              <Text style={[styles.statusValue, { color: isStreaming ? '#10B981' : '#6B7280' }]}>
                {isStreaming ? 'Active' : 'Stopped'}
              </Text>
            </View>
            
            {!isAccelerometerEnabled && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>⚠️ Accelerometer disabled in config</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>Error: {error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.button,
                isStreaming ? styles.buttonStop : styles.buttonStart,
                !moduleAvailable && styles.buttonDisabled
              ]}
              onPress={handleToggleStreaming}
              disabled={!moduleAvailable}
            >
              <Text style={styles.buttonText}>
                {isStreaming ? '⏹ Stop Accelerometer' : '▶ Start Accelerometer'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Real-time Statistics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistics</Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.totalSamples || 0}</Text>
                <Text style={styles.statLabel}>Total Samples</Text>
              </View>
              
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{stats.totalChunks || 0}</Text>
                <Text style={styles.statLabel}>Chunks Sent</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last Sync:</Text>
              <Text style={styles.infoValue}>
                {formatTimestamp(stats.lastSyncTime)}
              </Text>
            </View>

            {lastChunk && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Chunk:</Text>
                <Text style={styles.infoValue}>
                  {lastChunk.samples?.length || 0} samples
                </Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Offline Queue */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Offline Queue</Text>
            
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Pending:</Text>
              <Text style={[styles.statusValue, { color: pendingCount > 0 ? '#F59E0B' : '#10B981' }]}>
                {pendingCount} items
              </Text>
            </View>

            {isProcessing && (
              <View style={styles.infoRow}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.infoLabel}>Processing queue...</Text>
              </View>
            )}

            {pendingCount > 0 && (
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={handleFlushQueue}
                disabled={isProcessing}
              >
                <Text style={styles.buttonText}>Flush Queue</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.divider} />

          {/* Backend Health */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Backend Status</Text>
            
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(backendHealthy) }]} />
              <Text style={styles.statusLabel}>API Health:</Text>
              {checkingHealth ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <Text style={[styles.statusValue, { color: getStatusColor(backendHealthy) }]}>
                  {getStatusText(backendHealthy)}
                </Text>
              )}
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Endpoint:</Text>
              <Text style={[styles.infoValue, { fontSize: 11 }]}>/ingest/Accelerometer</Text>
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsBox}>
            <Text style={styles.instructionsTitle}>📋 Testing Instructions</Text>
            <Text style={styles.instructionsText}>
              1. Verify "Native Module" shows Available{'\n'}
              2. Tap "Start Accelerometer" button{'\n'}
              3. Watch stats increment in real-time{'\n'}
              4. Check Metro console for streaming logs{'\n'}
              5. Verify MongoDB receives chunks
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  expandIcon: {
    fontSize: 16,
    color: '#6B7280',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginRight: 8,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
    flex: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 16,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonStart: {
    backgroundColor: '#10B981',
  },
  buttonStop: {
    backgroundColor: '#EF4444',
  },
  buttonSecondary: {
    backgroundColor: '#3B82F6',
  },
  buttonDisabled: {
    backgroundColor: '#D1D5DB',
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    color: '#92400E',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#991B1B',
  },
  instructionsBox: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 12,
    color: '#1E3A8A',
    lineHeight: 18,
  },
});


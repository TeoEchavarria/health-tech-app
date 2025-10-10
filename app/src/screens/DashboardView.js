// Dashboard screen showing today's health metrics with charts
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { fetchRecordsForType } from '../services/healthSync';
import { recordsToChartData } from '../utils/normalizeRecord';
import { EventEmitter } from '../utils/eventBus';
import { isoStartOfToday, isoNow, formatDateTime } from '../utils/dateHelpers';
import SyncButton from '../components/SyncButton';
import ChartCard from '../components/ChartCard';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Metrics to display on dashboard
const METRICS = [
  { key: 'Vo2Max', title: 'VO2 Max' },
  { key: 'RestingHeartRate', title: 'Resting Heart Rate' },
  { key: 'HeartRate', title: 'Heart Rate' },
  { key: 'BloodPressure', title: 'Blood Pressure' },
  { key: 'BodyFat', title: 'Body Fat' },
  { key: 'LeanBodyMass', title: 'Lean Body Mass' },
  { key: 'Weight', title: 'Weight' },
  { key: 'RespiratoryRate', title: 'Respiratory Rate' },
  { key: 'SleepSession', title: 'Sleep Duration' },
  { key: 'Steps', title: 'Steps' },
  { key: 'Distance', title: 'Distance' },
  { key: 'ActiveCaloriesBurned', title: 'Active Calories' },
  { key: 'ExerciseSession', title: 'Exercise Duration' },
  { key: 'OxygenSaturation', title: 'Oxygen Saturation' },
  { key: 'BloodGlucose', title: 'Blood Glucose' },
];

export default function DashboardView({ navigation, onNavigateToSettings }) {
  const [dataMap, setDataMap] = useState({});
  const [lastSync, setLastSync] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [authToken, setAuthToken] = useState(null);

  // Load authentication token
  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await AsyncStorage.getItem('login');
        setAuthToken(token);
      } catch (error) {
        console.error('Error loading token:', error);
      }
    };
    loadToken();
  }, []);

  // Load today's data for all metrics
  const loadToday = useCallback(async () => {
    setRefreshing(true);
    const start = isoStartOfToday();
    const end = isoNow();

    const next = {};
    
    // Fetch data for all metrics in parallel
    await Promise.all(
      METRICS.map(async (metric) => {
        try {
          const records = await fetchRecordsForType(metric.key, {
            startTime: start,
            endTime: end
          });
          
          // Convert records to chart data
          const chartData = recordsToChartData(metric.key, records, 'time');
          next[metric.key] = chartData;
        } catch (error) {
          console.warn(`Error fetching ${metric.key}:`, error);
          next[metric.key] = [];
        }
      })
    );
    
    setDataMap(next);
    setRefreshing(false);
  }, []);

  // Initial load
  useEffect(() => {
    loadToday();
    
    // Load last sync timestamp
    const loadLastSync = async () => {
      try {
        const timestamp = await AsyncStorage.getItem('lastSync');
        if (timestamp) {
          setLastSync(timestamp);
        }
      } catch (error) {
        console.error('Error loading last sync:', error);
      }
    };
    loadLastSync();
  }, [loadToday]);

  // Subscribe to sync completion events
  useEffect(() => {
    const subscription = EventEmitter.addListener('SYNC_COMPLETED', ({ timestamp }) => {
      setLastSync(timestamp);
      loadToday();
      
      // Save last sync timestamp
      AsyncStorage.setItem('lastSync', timestamp).catch(console.error);
    });

    return () => {
      subscription.remove();
    };
  }, [loadToday]);

  const handleSyncSuccess = (timestamp) => {
    setLastSync(timestamp);
    loadToday();
  };

  // Calculate summary statistics
  const totalDataPoints = Object.values(dataMap).reduce((sum, data) => sum + data.length, 0);
  const metricsWithData = Object.values(dataMap).filter(data => data.length > 0).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <Text style={styles.headerSubtitle}>Today's Health Metrics</Text>
          </View>
          <SyncButton
            onSuccess={handleSyncSuccess}
            authToken={authToken}
          />
        </View>
        
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{metricsWithData}</Text>
            <Text style={styles.statLabel}>Metrics</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalDataPoints}</Text>
            <Text style={styles.statLabel}>Data Points</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValueSmall}>
              {lastSync ? formatDateTime(lastSync).split(',')[1] : 'Never'}
            </Text>
            <Text style={styles.statLabel}>Last Sync</Text>
          </View>
        </View>
      </View>

      {/* Metrics List */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadToday}
            colors={['#3B82F6']}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metricsList}>
          {METRICS.map((metric) => (
            <ChartCard
              key={metric.key}
              title={metric.title}
              width="100%"
              data={dataMap[metric.key] || []}
              metricKey={metric.key}
            />
          ))}
        </View>

        {/* Settings Button */}
        {onNavigateToSettings && (
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={onNavigateToSettings}
          >
            <Text style={styles.settingsButtonText}>⚙️ Settings</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 2,
  },
  statValueSmall: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  scrollContent: {
    padding: 16,
  },
  metricsList: {
    gap: 12,
  },
  settingsButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
});


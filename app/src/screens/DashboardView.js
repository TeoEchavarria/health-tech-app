// Dashboard screen showing today's health metrics with charts
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, TouchableOpacity } from 'react-native';
import { fetchRecordsForType, fetchLatestRecordForType, ensureReadPermissions } from '../services/healthSync';
import { recordsToChartData } from '../utils/normalizeRecord';
import { EventEmitter } from '../utils/eventBus';
import { isoStartOfToday, isoNow, formatDateTime } from '../utils/dateHelpers';
import SyncButton from '../components/SyncButton';
import ChartCard from '../components/ChartCard';
import FloatingActionButton from '../components/FloatingActionButton';
import NutritionAddModal from './NutritionAddModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

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
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showEmptyMetrics, setShowEmptyMetrics] = useState(false);

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

  // Load today's data for all metrics with fallback to latest record
  const loadToday = useCallback(async () => {
    setRefreshing(true);
    
    // Ensure we have read permissions before attempting to fetch data
    const hasPermissions = await ensureReadPermissions();
    
    if (!hasPermissions) {
      Toast.show({
        type: 'error',
        text1: 'Permisos requeridos',
        text2: 'Por favor otorga permisos de lectura para ver tus datos de salud',
      });
      setRefreshing(false);
      return;
    }
    
    const start = isoStartOfToday();
    const end = isoNow();

    const next = {};
    let totalRecordsFound = 0;
    
    // Fetch data for all metrics in parallel
    await Promise.all(
      METRICS.map(async (metric) => {
        try {
          // First, try to get today's data
          let records = await fetchRecordsForType(metric.key, {
            startTime: start,
            endTime: end
          });
          
          let isFromToday = true;
          
          // If no data from today, fetch the latest record available
          if (!records || records.length === 0) {
            records = await fetchLatestRecordForType(metric.key);
            isFromToday = false;
          }
          
          // Convert records to chart data
          const chartData = recordsToChartData(metric.key, records, 'time');
          
          if (chartData.length > 0) {
            totalRecordsFound += chartData.length;
          }
          
          // Add metadata about the data source
          next[metric.key] = {
            data: chartData,
            isFromToday: isFromToday,
            recordDate: records.length > 0 
              ? (metric.key === 'SleepSession' || metric.key === 'ExerciseSession'
                  ? (records[records.length - 1].endTime || records[records.length - 1].startTime)
                  : (records[records.length - 1].startTime || records[records.length - 1].time))
              : null
          };
        } catch (error) {
          console.warn(`Error fetching ${metric.key}:`, error);
          next[metric.key] = {
            data: [],
            isFromToday: true,
            recordDate: null
          };
        }
      })
    );
    
    setDataMap(next);
    setRefreshing(false);
    
    // Show a toast if no data was found at all
    if (totalRecordsFound === 0) {
      Toast.show({
        type: 'info',
        text1: 'No hay datos disponibles',
        text2: 'Intenta sincronizar tus datos de Health Connect',
        position: 'bottom',
      });
    }
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

    // Subscribe to nutrition updates
    const nutritionSubscription = EventEmitter.addListener('NUTRITION_UPDATED', ({ date }) => {
      // Optionally refresh data or show notification
      Toast.show({
        type: 'info',
        text1: 'Nutrition Updated',
        text2: `Data updated for ${date}`,
      });
    });

    return () => {
      subscription.remove();
      nutritionSubscription.remove();
    };
  }, [loadToday]);

  const handleSyncSuccess = (timestamp) => {
    setLastSync(timestamp);
    loadToday();
  };

  const handleNutritionPress = () => {
    setShowNutritionModal(true);
  };

  const handleReceiptPress = () => {
    Toast.show({
      type: 'info',
      text1: 'Coming Soon',
      text2: 'Receipt analysis feature will be available soon',
    });
  };

  // Calculate summary statistics
  const totalDataPoints = Object.values(dataMap).reduce((sum, metricData) => sum + (metricData.data?.length || 0), 0);
  const metricsWithData = Object.values(dataMap).filter(metricData => metricData.data?.length > 0).length;
  
  // Split metrics into those with and without data
  const metricsWithDataList = METRICS.filter(metric => {
    const metricData = dataMap[metric.key] || { data: [] };
    return metricData.data && metricData.data.length > 0;
  });
  
  const metricsWithoutDataList = METRICS.filter(metric => {
    const metricData = dataMap[metric.key] || { data: [] };
    return !metricData.data || metricData.data.length === 0;
  });

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
          {/* Show metrics with data */}
          {metricsWithDataList.map((metric) => {
            const metricData = dataMap[metric.key] || { data: [], isFromToday: true, recordDate: null };
            return (
              <ChartCard
                key={metric.key}
                title={metric.title}
                width="100%"
                data={metricData.data || []}
                metricKey={metric.key}
                isFromToday={metricData.isFromToday}
                recordDate={metricData.recordDate}
              />
            );
          })}
          
          {/* Collapsible section for metrics without data */}
          {metricsWithoutDataList.length > 0 && (
            <View style={styles.emptyMetricsSection}>
              <TouchableOpacity
                style={styles.emptyMetricsToggle}
                onPress={() => setShowEmptyMetrics(!showEmptyMetrics)}
              >
                <Text style={styles.emptyMetricsToggleText}>
                  {showEmptyMetrics ? '▼' : '▶'} Available Metrics ({metricsWithoutDataList.length})
                </Text>
              </TouchableOpacity>
              
              {showEmptyMetrics && (
                <View style={styles.emptyMetricsList}>
                  {metricsWithoutDataList.map((metric) => {
                    const metricData = dataMap[metric.key] || { data: [], isFromToday: true, recordDate: null };
                    return (
                      <ChartCard
                        key={metric.key}
                        title={metric.title}
                        width="100%"
                        data={metricData.data || []}
                        metricKey={metric.key}
                        isFromToday={metricData.isFromToday}
                        recordDate={metricData.recordDate}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          )}
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

      {/* Floating Action Button */}
      <FloatingActionButton
        onNutritionPress={handleNutritionPress}
        onReceiptPress={handleReceiptPress}
      />

      {/* Nutrition Add Modal */}
      <NutritionAddModal
        visible={showNutritionModal}
        onClose={() => setShowNutritionModal(false)}
      />
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
  emptyMetricsSection: {
    marginTop: 16,
  },
  emptyMetricsToggle: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  emptyMetricsToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptyMetricsList: {
    gap: 12,
  },
});


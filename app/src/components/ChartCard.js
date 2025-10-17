// Chart card component for displaying health metrics
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getUnitLabel } from '../utils/normalizeRecord';

// Metrics that show cumulative totals (sum of all values)
const CUMULATIVE_METRICS = ['Distance', 'ActiveCaloriesBurned', 'TotalCaloriesBurned', 'ExerciseSession', 'SleepSession'];

// Metrics that are cumulative counters (take max value, not sum)
const COUNTER_MAX_METRICS = ['Steps'];

// Metrics that show the latest value only
const INSTANTANEOUS_METRICS = [
  'HeartRate', 'RestingHeartRate', 'Vo2Max', 'BloodPressure', 
  'BodyFat', 'LeanBodyMass', 'Weight', 'RespiratoryRate', 
  'OxygenSaturation', 'BloodGlucose'
];

export default function ChartCard({
  title,
  data = [],
  metricKey,
  width = '100%',
  isFromToday = true,
  recordDate = null
}) {
  const unit = getUnitLabel(metricKey);
  
  // Determine metric type
  const isCumulative = CUMULATIVE_METRICS.includes(metricKey);
  const isCounterMax = COUNTER_MAX_METRICS.includes(metricKey);
  const isInstantaneous = INSTANTANEOUS_METRICS.includes(metricKey);
  const isBP = metricKey === 'BloodPressure';
  
  // If no data, show empty state
  if (data.length === 0) {
    return (
      <View style={[styles.card, { width }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No hay datos disponibles</Text>
          <Text style={styles.emptySubtext}>Sincroniza para ver tus datos</Text>
        </View>
      </View>
    );
  }

  // Calculate display value based on metric type
  let displayValue;
  let displayLabel;
  let secondaryValue = null;
  let hasHourlyData = false;
  let recordCount = data.length;
  
  // Check if we have aggregated data (new format)
  const firstRecord = data[0];
  const isAggregated = firstRecord && (firstRecord.aggregate || firstRecord.hourly || firstRecord.measurements);
  
  if (isAggregated && firstRecord.aggregate) {
    // New aggregated format
    if (firstRecord.aggregate.total !== undefined) {
      // Category 1: Cumulative
      displayValue = Math.round(firstRecord.aggregate.total * 10) / 10;
      displayLabel = 'Total del día';
      recordCount = firstRecord.aggregate.recordCount || 1;
    } else if (firstRecord.aggregate.value !== undefined) {
      // Category 2: Instantaneous
      displayValue = firstRecord.aggregate.value;
      displayLabel = firstRecord.aggregate.timestamp ? 'Última medición' : 'Valor del día';
      recordCount = firstRecord.aggregate.recordCount || 1;
    } else if (firstRecord.aggregate.dailyAvg !== undefined) {
      // Category 3: Hourly (show daily average)
      displayValue = Math.round(firstRecord.aggregate.dailyAvg * 10) / 10;
      displayLabel = 'Promedio del día';
      recordCount = firstRecord.aggregate.totalSamples || 1;
      hasHourlyData = firstRecord.hourly && firstRecord.hourly.length > 0;
    } else if (firstRecord.aggregate.totalDurationMinutes !== undefined) {
      // Category 5: Sessions
      displayValue = firstRecord.aggregate.totalDurationMinutes;
      displayLabel = 'Total del día';
      recordCount = firstRecord.aggregate.totalSessions || 1;
    }
  } else {
    // Legacy format (individual records)
    if (isCounterMax) {
      // Take maximum value for cumulative counter metrics (e.g., Steps)
      displayValue = Math.max(...data.map(d => d.y || 0));
      displayLabel = isFromToday ? 'Total del día' : 'Último registro';
    } else if (isCumulative) {
      // Sum all values for cumulative metrics
      displayValue = Math.round(data.reduce((sum, d) => sum + (d.y || 0), 0) * 10) / 10;
      displayLabel = isFromToday ? 'Total del día' : 'Último registro';
    } else if (isInstantaneous || isBP) {
      // Show latest value for instantaneous metrics
      const latest = data[data.length - 1];
      displayValue = latest.y;
      displayLabel = isFromToday ? 'Última medición' : 'Último registro';
      
      // For blood pressure, also get diastolic
      if (isBP && latest.secondary) {
        secondaryValue = latest.secondary;
      }
      
      // Check for hourly data in the point
      hasHourlyData = latest.hourly && latest.hourly.length > 0;
    } else {
      // Default: show average
      displayValue = Math.round((data.reduce((sum, d) => sum + (d.y || 0), 0) / data.length) * 10) / 10;
      displayLabel = isFromToday ? 'Promedio del día' : 'Último registro';
    }
  }
  
  // Format record date for display if not from today
  const formatRecordDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  // Format duration in minutes to hours and minutes
  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours === 0) {
      return `${mins} min`;
    } else if (mins === 0) {
      return `${hours} h`;
    } else {
      return `${hours} h ${mins} min`;
    }
  };

  // Check if this is a duration metric
  const isDuration = ['SleepSession', 'ExerciseSession'].includes(metricKey);

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.metricLabel}>{displayLabel}</Text>
      </View>

      <View style={styles.valueContainer}>
        {isBP ? (
          // Blood pressure shows systolic/diastolic
          <View style={styles.bpContainer}>
            <View style={styles.bpValue}>
              <Text style={styles.mainValue}>{Math.round(displayValue)}</Text>
              <Text style={styles.bpLabel}>Sistólica</Text>
            </View>
            <Text style={styles.bpSeparator}>/</Text>
            <View style={styles.bpValue}>
              <Text style={styles.mainValue}>{Math.round(secondaryValue)}</Text>
              <Text style={styles.bpLabel}>Diastólica</Text>
            </View>
            <Text style={styles.unitText}>{unit}</Text>
          </View>
        ) : isDuration ? (
          // Duration metrics show hours and minutes
          <View style={styles.singleValueContainer}>
            <Text style={styles.durationValue}>{formatDuration(displayValue)}</Text>
          </View>
        ) : (
          // Regular metrics show single value
          <View style={styles.singleValueContainer}>
            <Text style={styles.mainValue}>{displayValue}</Text>
            <Text style={styles.unitText}>{unit}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.dataCount}>
          {recordCount} {recordCount === 1 ? 'registro' : 'registros'}
          {hasHourlyData ? ' • Datos horarios disponibles' : ''}
        </Text>
        {!isFromToday && recordDate ? (
          <Text style={styles.historicDate}>
            📅 {formatRecordDate(recordDate)}
          </Text>
        ) : data.length > 0 && !isAggregated ? (
          <Text style={styles.timestamp}>
            {data[data.length - 1].x}
          </Text>
        ) : isAggregated && firstRecord.date ? (
          <Text style={styles.timestamp}>
            {formatRecordDate(firstRecord.date)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  valueContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  singleValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  mainValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#3B82F6',
  },
  durationValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#3B82F6',
  },
  unitText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 8,
  },
  bpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bpValue: {
    alignItems: 'center',
  },
  bpSeparator: {
    fontSize: 36,
    fontWeight: '300',
    color: '#9CA3AF',
    marginHorizontal: 8,
  },
  bpLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
    marginTop: 8,
  },
  dataCount: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  timestamp: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  historicDate: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
});


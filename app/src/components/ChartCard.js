// Chart card component for displaying health metrics
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { VictoryChart, VictoryLine, VictoryAxis, VictoryTheme, VictoryBar, VictoryGroup, VictoryScatter } from 'victory-native';
import { getUnitLabel } from '../utils/normalizeRecord';

const screenWidth = Dimensions.get('window').width;

export default function ChartCard({
  title,
  data = [],
  metricKey,
  width = '100%',
  height = 200
}) {
  // Determine chart type based on metric
  const isBP = metricKey === 'BloodPressure';
  const isBar = ['SleepSession', 'BodyFat', 'LeanBodyMass', 'ExerciseSession', 'FloorsClimbed'].includes(metricKey);
  const isScatter = ['Steps', 'ActiveCaloriesBurned', 'TotalCaloriesBurned'].includes(metricKey);
  
  const unit = getUnitLabel(metricKey);
  
  // Calculate average value for display
  const average = data.length > 0
    ? Math.round((data.reduce((sum, d) => sum + (d.y || 0), 0) / data.length) * 10) / 10
    : 0;
  
  // Get latest value
  const latest = data.length > 0 ? data[data.length - 1].y : 0;
  
  // If no data, show empty state
  if (data.length === 0) {
    return (
      <View style={[styles.card, { width }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No data available</Text>
          <Text style={styles.emptySubtext}>Sync to see your data</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.stats}>
          <Text style={styles.statValue}>
            {latest} <Text style={styles.statUnit}>{unit}</Text>
          </Text>
          {data.length > 1 && (
            <Text style={styles.statLabel}>
              Avg: {average} {unit}
            </Text>
          )}
        </View>
      </View>

      {isBP ? (
        // Blood pressure: two-line chart (systolic and diastolic)
        <VictoryChart
          theme={VictoryTheme.material}
          domainPadding={10}
          height={height}
          padding={{ top: 10, bottom: 30, left: 40, right: 10 }}
        >
          <VictoryAxis
            tickFormat={(t) => String(t).substring(0, 5)}
            style={{
              tickLabels: { fontSize: 8, angle: -45, textAnchor: 'end' }
            }}
          />
          <VictoryAxis
            dependentAxis
            style={{
              tickLabels: { fontSize: 9 }
            }}
          />
          <VictoryGroup>
            <VictoryLine
              data={data.map(d => ({ x: d.x, y: d.y }))}
              interpolation="natural"
              style={{
                data: { stroke: '#EF4444', strokeWidth: 2 }
              }}
            />
            <VictoryLine
              data={data.map(d => ({ x: d.x, y: d.secondary }))}
              interpolation="natural"
              style={{
                data: { stroke: '#3B82F6', strokeWidth: 2 }
              }}
            />
          </VictoryGroup>
        </VictoryChart>
      ) : isBar ? (
        // Bar chart for discrete measurements
        <VictoryChart
          theme={VictoryTheme.material}
          domainPadding={20}
          height={height}
          padding={{ top: 10, bottom: 30, left: 40, right: 10 }}
        >
          <VictoryAxis
            tickFormat={(t) => String(t).substring(0, 5)}
            style={{
              tickLabels: { fontSize: 8, angle: -45, textAnchor: 'end' }
            }}
          />
          <VictoryAxis
            dependentAxis
            style={{
              tickLabels: { fontSize: 9 }
            }}
          />
          <VictoryBar
            data={data}
            x="x"
            y="y"
            style={{
              data: { fill: '#3B82F6' }
            }}
          />
        </VictoryChart>
      ) : isScatter ? (
        // Scatter plot for cumulative/count data
        <VictoryChart
          theme={VictoryTheme.material}
          domainPadding={10}
          height={height}
          padding={{ top: 10, bottom: 30, left: 40, right: 10 }}
        >
          <VictoryAxis
            tickFormat={(t) => String(t).substring(0, 5)}
            style={{
              tickLabels: { fontSize: 8, angle: -45, textAnchor: 'end' }
            }}
          />
          <VictoryAxis
            dependentAxis
            style={{
              tickLabels: { fontSize: 9 }
            }}
          />
          <VictoryScatter
            data={data}
            x="x"
            y="y"
            size={3}
            style={{
              data: { fill: '#10B981' }
            }}
          />
        </VictoryChart>
      ) : (
        // Line chart for continuous measurements
        <VictoryChart
          theme={VictoryTheme.material}
          domainPadding={10}
          height={height}
          padding={{ top: 10, bottom: 30, left: 40, right: 10 }}
        >
          <VictoryAxis
            tickFormat={(t) => String(t).substring(0, 5)}
            style={{
              tickLabels: { fontSize: 8, angle: -45, textAnchor: 'end' }
            }}
          />
          <VictoryAxis
            dependentAxis
            style={{
              tickLabels: { fontSize: 9 }
            }}
          />
          <VictoryLine
            data={data}
            x="x"
            y="y"
            interpolation="natural"
            style={{
              data: { stroke: '#3B82F6', strokeWidth: 2 }
            }}
          />
        </VictoryChart>
      )}
      
      <Text style={styles.dataCount}>
        {data.length} {data.length === 1 ? 'reading' : 'readings'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3B82F6',
  },
  statUnit: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6B7280',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  dataCount: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
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


import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';

import { getDailyNutrition, deleteMeal } from '../services/nutritionApi';

/**
 * Screen showing detailed nutrition information for a specific date
 * Displays daily totals and list of individual meals
 */
export default function NutritionDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { date: initialDate, justAdded } = route.params || {};
  
  const [selectedDate, setSelectedDate] = useState(
    initialDate || new Date().toISOString().split('T')[0]
  );
  const [nutritionData, setNutritionData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingMeal, setDeletingMeal] = useState(null);

  useEffect(() => {
    loadNutritionData();
    
    // Show success message if just added a meal
    if (justAdded) {
      Toast.show({
        type: 'success',
        text1: 'Meal Added!',
        text2: 'Your nutrition data has been updated',
      });
    }
  }, [selectedDate]);

  const loadNutritionData = async () => {
    try {
      setIsLoading(true);
      const data = await getDailyNutrition(selectedDate);
      setNutritionData(data);
    } catch (error) {
      console.error('Error loading nutrition data:', error);
      Toast.show({
        type: 'error',
        text1: 'Load Failed',
        text2: error.message || 'Could not load nutrition data',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadNutritionData();
    setIsRefreshing(false);
  };

  const handleDeleteMeal = (timestamp) => {
    Alert.alert(
      'Delete Meal',
      'Are you sure you want to delete this meal entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDeleteMeal(timestamp),
        },
      ]
    );
  };

  const confirmDeleteMeal = async (timestamp) => {
    try {
      setDeletingMeal(timestamp);
      await deleteMeal(selectedDate, timestamp);
      
      Toast.show({
        type: 'success',
        text1: 'Meal Deleted',
        text2: 'The meal has been removed from your records',
      });

      // Reload data to reflect changes
      await loadNutritionData();
    } catch (error) {
      console.error('Error deleting meal:', error);
      Toast.show({
        type: 'error',
        text1: 'Delete Failed',
        text2: error.message || 'Could not delete the meal',
      });
    } finally {
      setDeletingMeal(null);
    }
  };

  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return 'Unknown time';
    }
  };

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString([], { 
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  };

  const renderMealItem = (meal, index) => (
    <View key={index} style={styles.mealItem}>
      <View style={styles.mealHeader}>
        <Text style={styles.mealTime}>{formatTime(meal.timestamp)}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteMeal(meal.timestamp)}
          disabled={deletingMeal === meal.timestamp}
        >
          {deletingMeal === meal.timestamp ? (
            <ActivityIndicator color="#EF4444" size="small" />
          ) : (
            <Text style={styles.deleteButtonText}>🗑️</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.mealMacros}>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{meal.carbohydrates}g</Text>
          <Text style={styles.macroLabel}>Carbs</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{meal.protein}g</Text>
          <Text style={styles.macroLabel}>Protein</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{meal.fat}g</Text>
          <Text style={styles.macroLabel}>Fat</Text>
        </View>
        <View style={styles.macroItem}>
          <Text style={styles.macroValue}>{meal.calories}</Text>
          <Text style={styles.macroLabel}>Calories</Text>
        </View>
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateIcon}>🍽️</Text>
      <Text style={styles.emptyStateTitle}>No meals recorded</Text>
      <Text style={styles.emptyStateText}>
        Start tracking your nutrition by adding your first meal
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading nutrition data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nutrition Details</Text>
        <Text style={styles.headerDate}>{formatDate(selectedDate)}</Text>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Daily Totals Card */}
        <View style={styles.totalsCard}>
          <Text style={styles.totalsTitle}>Daily Totals</Text>
          <View style={styles.totalsGrid}>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>
                {nutritionData?.total_carbohydrates?.toFixed(1) || '0.0'}
              </Text>
              <Text style={styles.totalLabel}>Carbs (g)</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>
                {nutritionData?.total_protein?.toFixed(1) || '0.0'}
              </Text>
              <Text style={styles.totalLabel}>Protein (g)</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>
                {nutritionData?.total_fat?.toFixed(1) || '0.0'}
              </Text>
              <Text style={styles.totalLabel}>Fat (g)</Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={styles.totalValue}>
                {nutritionData?.total_calories?.toFixed(0) || '0'}
              </Text>
              <Text style={styles.totalLabel}>Calories</Text>
            </View>
          </View>
        </View>

        {/* Meals List */}
        <View style={styles.mealsSection}>
          <Text style={styles.sectionTitle}>
            Meals ({nutritionData?.internal_registers?.length || 0})
          </Text>
          
          {nutritionData?.internal_registers?.length > 0 ? (
            nutritionData.internal_registers.map((meal, index) => renderMealItem(meal, index))
          ) : (
            renderEmptyState()
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerDate: {
    fontSize: 16,
    color: '#6B7280',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  totalsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  totalsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
    textAlign: 'center',
  },
  totalsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  totalItem: {
    alignItems: 'center',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  mealsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  mealItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mealTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  mealMacros: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});

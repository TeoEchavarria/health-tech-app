// Nutrition API service for communicating with nutrition endpoints
import { apiClient } from './api';

/**
 * Analyze a food image using AI to extract nutritional information
 * @param {string} imageUri - Local URI of the image file
 * @param {string} description - Optional text description of the food
 * @returns {Promise<{protein: number, carbs: number, fat: number, calories: number}>}
 */
export async function analyzeFoodImage(imageUri, description = null) {
  try {
    const formData = new FormData();
    
    // Append image file
    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'food.jpg'
    });
    
    // Append description if provided
    if (description) {
      formData.append('description', description);
    }
    
    const response = await apiClient.post('/extract-info/analyze-food', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error analyzing food image:', error);
    throw new Error(`Failed to analyze food image: ${error.response?.data?.detail || error.message}`);
  }
}

/**
 * Add a meal entry to the nutrition tracker
 * @param {Object} mealData - Meal data object
 * @param {number} mealData.carbohydrates - Carbohydrates in grams
 * @param {number} mealData.protein - Protein in grams
 * @param {number} mealData.fat - Fat in grams
 * @param {number} mealData.calories - Calories in kcal
 * @param {string} mealData.timestamp - ISO 8601 timestamp (optional, defaults to now)
 * @returns {Promise<Object>} Response with success status and daily totals
 */
export async function addMeal(mealData) {
  try {
    const response = await apiClient.post('/nutrition/add-meal', mealData);
    return response.data;
  } catch (error) {
    console.error('Error adding meal:', error);
    throw new Error(`Failed to add meal: ${error.response?.data?.detail || error.message}`);
  }
}

/**
 * Get nutrition data for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today)
 * @returns {Promise<Object>} Daily nutrition data with totals and meal list
 */
export async function getDailyNutrition(date = null) {
  try {
    const params = date ? { date } : {};
    const response = await apiClient.get('/nutrition/daily', { params });
    return response.data;
  } catch (error) {
    console.error('Error getting daily nutrition:', error);
    throw new Error(`Failed to get daily nutrition: ${error.response?.data?.detail || error.message}`);
  }
}

/**
 * Delete a specific meal entry
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} timestamp - ISO 8601 timestamp of the meal to delete
 * @returns {Promise<Object>} Success response
 */
export async function deleteMeal(date, timestamp) {
  try {
    const response = await apiClient.delete('/nutrition/meal', {
      params: { date, timestamp }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting meal:', error);
    throw new Error(`Failed to delete meal: ${error.response?.data?.detail || error.message}`);
  }
}

/**
 * Delete all nutrition data for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Success response
 */
export async function deleteDailyNutrition(date) {
  try {
    const response = await apiClient.delete('/nutrition/daily', {
      params: { date }
    });
    return response.data;
  } catch (error) {
    console.error('Error deleting daily nutrition:', error);
    throw new Error(`Failed to delete daily nutrition: ${error.response?.data?.detail || error.message}`);
  }
}

/**
 * Add multiple meals at once (bulk operation)
 * @param {Array} meals - Array of meal objects
 * @returns {Promise<Object>} Response with bulk operation results
 */
export async function bulkAddMeals(meals) {
  try {
    const response = await apiClient.post('/nutrition/bulk-add-meals', { meals });
    return response.data;
  } catch (error) {
    console.error('Error bulk adding meals:', error);
    throw new Error(`Failed to bulk add meals: ${error.response?.data?.detail || error.message}`);
  }
}

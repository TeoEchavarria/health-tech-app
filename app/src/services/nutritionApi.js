// Nutrition API service for communicating with nutrition endpoints
import { apiClient } from './api';
import { apiCall } from '../utils/apiWrapper';

/**
 * Analyze a food image using AI to extract nutritional information
 * @param {string} imageUri - Local URI of the image file
 * @param {string} description - Optional text description of the food
 * @returns {Promise<{protein: number, carbs: number, fat: number, calories: number}>}
 */
export async function analyzeFoodImage(imageUri, description = null) {
  return apiCall(
    async () => {
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
      
      // Transform the response to match the expected field names
      const { carbs, ...rest } = response.data;
      return {
        ...rest,
        carbohydrates: carbs // Map 'carbs' to 'carbohydrates'
      };
    },
    {
      operation: 'analyzeFoodImage',
      endpoint: '/extract-info/analyze-food',
      method: 'POST',
      hasImage: true,
      description: description || 'No description provided',
      showToast: false,
    }
  );
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
  return apiCall(
    async () => {
      const response = await apiClient.post('/nutrition/add-meal', mealData);
      return response.data;
    },
    {
      operation: 'addMeal',
      endpoint: '/nutrition/add-meal',
      method: 'POST',
      mealData,
      showToast: false,
    }
  );
}

/**
 * Get nutrition data for a specific date
 * @param {string} date - Date in YYYY-MM-DD format (optional, defaults to today)
 * @returns {Promise<Object>} Daily nutrition data with totals and meal list
 */
export async function getDailyNutrition(date = null) {
  return apiCall(
    async () => {
      const params = date ? { date } : {};
      const response = await apiClient.get('/nutrition/daily', { params });
      return response.data;
    },
    {
      operation: 'getDailyNutrition',
      endpoint: '/nutrition/daily',
      method: 'GET',
      date,
      showToast: false,
    }
  );
}

/**
 * Delete a specific meal entry
 * @param {string} date - Date in YYYY-MM-DD format
 * @param {string} timestamp - ISO 8601 timestamp of the meal to delete
 * @returns {Promise<Object>} Success response
 */
export async function deleteMeal(date, timestamp) {
  return apiCall(
    async () => {
      const response = await apiClient.delete('/nutrition/meal', {
        params: { date, timestamp }
      });
      return response.data;
    },
    {
      operation: 'deleteMeal',
      endpoint: '/nutrition/meal',
      method: 'DELETE',
      date,
      timestamp,
      showToast: false,
    }
  );
}

/**
 * Delete all nutrition data for a specific date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Success response
 */
export async function deleteDailyNutrition(date) {
  return apiCall(
    async () => {
      const response = await apiClient.delete('/nutrition/daily', {
        params: { date }
      });
      return response.data;
    },
    {
      operation: 'deleteDailyNutrition',
      endpoint: '/nutrition/daily',
      method: 'DELETE',
      date,
      showToast: false,
    }
  );
}

/**
 * Add multiple meals at once (bulk operation)
 * @param {Array} meals - Array of meal objects
 * @returns {Promise<Object>} Response with bulk operation results
 */
export async function bulkAddMeals(meals) {
  return apiCall(
    async () => {
      const response = await apiClient.post('/nutrition/bulk-add-meals', { meals });
      return response.data;
    },
    {
      operation: 'bulkAddMeals',
      endpoint: '/nutrition/bulk-add-meals',
      method: 'POST',
      mealCount: meals.length,
      showToast: false,
    }
  );
}

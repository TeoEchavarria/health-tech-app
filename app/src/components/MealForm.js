import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';

/**
 * Reusable meal form component for adding/editing nutrition data
 * @param {Object} props
 * @param {Object} props.initialValues - Initial values for the form fields
 * @param {Function} props.onSubmit - Callback when form is submitted
 * @param {Function} props.onCancel - Callback when form is cancelled
 * @param {boolean} props.isLoading - Loading state for submit button
 * @param {string} props.submitButtonText - Text for submit button
 */
export default function MealForm({
  initialValues = {},
  onSubmit,
  onCancel,
  isLoading = false,
  submitButtonText = 'Save Meal'
}) {
  const [formData, setFormData] = useState({
    carbohydrates: '',
    protein: '',
    fat: '',
    calories: '',
    timestamp: ''
  });

  // Initialize form with provided values
  useEffect(() => {
    if (initialValues) {
      setFormData({
        carbohydrates: initialValues.carbohydrates?.toString() || '',
        protein: initialValues.protein?.toString() || '',
        fat: initialValues.fat?.toString() || '',
        calories: initialValues.calories?.toString() || '',
        timestamp: initialValues.timestamp || ''
      });
    }
  }, [initialValues]);

  const handleInputChange = (field, value) => {
    // Only allow numbers and decimal point for numeric fields
    if (['carbohydrates', 'protein', 'fat', 'calories'].includes(field)) {
      // Remove any non-numeric characters except decimal point
      const numericValue = value.replace(/[^0-9.]/g, '');
      // Ensure only one decimal point
      const parts = numericValue.split('.');
      const cleanValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue;
      setFormData(prev => ({ ...prev, [field]: cleanValue }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const validateForm = () => {
    const errors = [];
    
    // Check required fields
    if (!formData.carbohydrates || formData.carbohydrates === '') {
      errors.push('Carbohydrates is required');
    }
    if (!formData.protein || formData.protein === '') {
      errors.push('Protein is required');
    }
    if (!formData.fat || formData.fat === '') {
      errors.push('Fat is required');
    }
    if (!formData.calories || formData.calories === '') {
      errors.push('Calories is required');
    }

    // Check for valid numbers
    const carbs = parseFloat(formData.carbohydrates);
    const protein = parseFloat(formData.protein);
    const fat = parseFloat(formData.fat);
    const calories = parseFloat(formData.calories);

    if (isNaN(carbs) || carbs < 0) {
      errors.push('Carbohydrates must be a valid number ≥ 0');
    }
    if (isNaN(protein) || protein < 0) {
      errors.push('Protein must be a valid number ≥ 0');
    }
    if (isNaN(fat) || fat < 0) {
      errors.push('Fat must be a valid number ≥ 0');
    }
    if (isNaN(calories) || calories < 0) {
      errors.push('Calories must be a valid number ≥ 0');
    }

    return errors;
  };

  const handleSubmit = () => {
    const errors = validateForm();
    
    if (errors.length > 0) {
      Alert.alert('Validation Error', errors.join('\n'));
      return;
    }

    // Prepare data for submission
    const mealData = {
      carbohydrates: parseFloat(formData.carbohydrates),
      protein: parseFloat(formData.protein),
      fat: parseFloat(formData.fat),
      calories: parseFloat(formData.calories),
      timestamp: formData.timestamp || new Date().toISOString()
    };

    onSubmit(mealData);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Meal</Text>
      
      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Carbohydrates (g)</Text>
          <TextInput
            style={styles.input}
            value={formData.carbohydrates}
            onChangeText={(value) => handleInputChange('carbohydrates', value)}
            placeholder="0.0"
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Protein (g)</Text>
          <TextInput
            style={styles.input}
            value={formData.protein}
            onChangeText={(value) => handleInputChange('protein', value)}
            placeholder="0.0"
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Fat (g)</Text>
          <TextInput
            style={styles.input}
            value={formData.fat}
            onChangeText={(value) => handleInputChange('fat', value)}
            placeholder="0.0"
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Calories (kcal)</Text>
          <TextInput
            style={styles.input}
            value={formData.calories}
            onChangeText={(value) => handleInputChange('calories', value)}
            placeholder="0"
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Timestamp (optional)</Text>
          <TextInput
            style={styles.input}
            value={formData.timestamp}
            onChangeText={(value) => handleInputChange('timestamp', value)}
            placeholder="Auto-generated if empty"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.helpText}>
            Leave empty to use current time
          </Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={isLoading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.submitButton, isLoading && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>{submitButtonText}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

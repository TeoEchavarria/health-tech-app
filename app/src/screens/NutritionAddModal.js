import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useNavigation } from '@react-navigation/native';

import MealForm from '../components/MealForm';
import { analyzeFoodImage, addMeal } from '../services/nutritionApi';
import { EventEmitter } from '../utils/eventBus';

/**
 * Modal for adding nutrition data with two options:
 * 1. Manual entry - direct form input
 * 2. Photo analysis - AI-powered food recognition
 */
export default function NutritionAddModal({ visible, onClose }) {
  const navigation = useNavigation();
  const [mode, setMode] = useState(null); // 'manual' or 'photo'
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzedData, setAnalyzedData] = useState(null);

  const handleClose = () => {
    setMode(null);
    setAnalyzedData(null);
    setIsAnalyzing(false);
    setIsSaving(false);
    onClose();
  };

  const handleManualEntry = () => {
    setMode('manual');
  };

  const handlePhotoAnalysis = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant camera roll permissions to analyze food photos.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Show image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setIsAnalyzing(true);
        setMode('photo');

        try {
          // Analyze the image
          const nutritionData = await analyzeFoodImage(result.assets[0].uri);
          setAnalyzedData(nutritionData);
          
          Toast.show({
            type: 'success',
            text1: 'Food Analysis Complete',
            text2: 'Review and adjust the values before saving',
          });
        } catch (error) {
          console.error('Error analyzing food:', error);
          Toast.show({
            type: 'error',
            text1: 'Analysis Failed',
            text2: error.message || 'Could not analyze the food image',
          });
          setMode(null);
        } finally {
          setIsAnalyzing(false);
        }
      }
    } catch (error) {
      console.error('Error with image picker:', error);
      Toast.show({
        type: 'error',
        text1: 'Image Selection Failed',
        text2: 'Could not access image library',
      });
    }
  };

  const handleMealSubmit = async (mealData) => {
    setIsSaving(true);
    
    try {
      const response = await addMeal(mealData);
      
      Toast.show({
        type: 'success',
        text1: 'Meal Added Successfully',
        text2: `Added to ${response.date}`,
      });

      // Emit event to update any listening components
      EventEmitter.emit('NUTRITION_UPDATED', { 
        date: response.date,
        type: 'meal_added'
      });

      // Navigate to nutrition detail screen
      navigation.navigate('NutritionDetail', { 
        date: response.date,
        justAdded: true 
      });

      handleClose();
    } catch (error) {
      console.error('Error saving meal:', error);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: error.message || 'Could not save the meal',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderSelectionScreen = () => (
    <View style={styles.selectionContainer}>
      <Text style={styles.title}>Add Nutrition</Text>
      <Text style={styles.subtitle}>Choose how you'd like to add your meal</Text>
      
      <View style={styles.optionsContainer}>
        <TouchableOpacity
          style={styles.optionButton}
          onPress={handleManualEntry}
        >
          <Text style={styles.optionIcon}>🍽️</Text>
          <Text style={styles.optionTitle}>Manual Entry</Text>
          <Text style={styles.optionDescription}>
            Enter nutrition values manually
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionButton}
          onPress={handlePhotoAnalysis}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <ActivityIndicator color="#3B82F6" size="large" />
          ) : (
            <Text style={styles.optionIcon}>📸</Text>
          )}
          <Text style={styles.optionTitle}>Photo Analysis</Text>
          <Text style={styles.optionDescription}>
            Take a photo and let AI analyze it
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={handleClose}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  const renderFormScreen = () => (
    <ScrollView style={styles.formContainer}>
      <MealForm
        initialValues={analyzedData}
        onSubmit={handleMealSubmit}
        onCancel={handleClose}
        isLoading={isSaving}
        submitButtonText={isSaving ? 'Saving...' : 'Save Meal'}
      />
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {!mode ? renderSelectionScreen() : renderFormScreen()}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  selectionContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 48,
  },
  optionsContainer: {
    gap: 16,
    marginBottom: 32,
  },
  optionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  optionIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  formContainer: {
    flex: 1,
  },
});

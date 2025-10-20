import React, { useState, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  Animated,
  StyleSheet,
  Dimensions
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Floating Action Button with animated submenu
 * Shows options for adding nutrition data
 */
export default function FloatingActionButton({ onNutritionPress, onReceiptPress }) {
  const [isOpen, setIsOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;
    
    Animated.parallel([
      Animated.timing(animation, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    setIsOpen(!isOpen);
  };

  const handleNutritionPress = () => {
    toggleMenu();
    onNutritionPress();
  };

  const handleReceiptPress = () => {
    toggleMenu();
    onReceiptPress();
  };

  const nutritionTranslateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -80],
  });

  const receiptTranslateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -160],
  });

  const nutritionOpacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const receiptOpacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const mainButtonRotation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  return (
    <View style={styles.container}>
      {/* Receipt Option */}
      <Animated.View
        style={[
          styles.menuItem,
          {
            transform: [{ translateY: receiptTranslateY }],
            opacity: receiptOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.menuButton}
          onPress={handleReceiptPress}
          activeOpacity={0.8}
        >
          <Text style={styles.menuIcon}>🧾</Text>
        </TouchableOpacity>
        <View style={styles.menuLabel}>
          <Text style={styles.menuLabelText}>Receipts</Text>
        </View>
      </Animated.View>

      {/* Nutrition Option */}
      <Animated.View
        style={[
          styles.menuItem,
          {
            transform: [{ translateY: nutritionTranslateY }],
            opacity: nutritionOpacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.menuButton}
          onPress={handleNutritionPress}
          activeOpacity={0.8}
        >
          <Text style={styles.menuIcon}>🍽️</Text>
        </TouchableOpacity>
        <View style={styles.menuLabel}>
          <Text style={styles.menuLabelText}>Nutrition</Text>
        </View>
      </Animated.View>

      {/* Main FAB Button */}
      <TouchableOpacity
        style={styles.mainButton}
        onPress={toggleMenu}
        activeOpacity={0.8}
      >
        <Animated.Text
          style={[
            styles.mainButtonIcon,
            { transform: [{ rotate: mainButtonRotation }] },
          ]}
        >
          {isOpen ? '✕' : '+'}
        </Animated.Text>
      </TouchableOpacity>

      {/* Backdrop */}
      {isOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          onPress={toggleMenu}
          activeOpacity={1}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    zIndex: 999,
    alignItems: 'center',
  },
  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  mainButtonIcon: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '300',
  },
  menuItem: {
    position: 'absolute',
    alignItems: 'center',
    right: 0,
    bottom: 0,
  },
  menuButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuIcon: {
    fontSize: 20,
  },
  menuLabel: {
    position: 'absolute',
    right: 60,
    top: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  menuLabelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  backdrop: {
    position: 'absolute',
    top: -screenHeight,
    left: -screenWidth,
    width: screenWidth * 2,
    height: screenHeight * 2,
    backgroundColor: 'transparent',
    zIndex: -1,
  },
});

// Sync button component with loading state
import React, { useState } from 'react';
import { TouchableOpacity, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { syncAll } from '../services/healthSync';
import { EventEmitter } from '../utils/eventBus';
import Toast from 'react-native-toast-message';

export default function SyncButton({ onSuccess, authToken, style, textStyle }) {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    
    Toast.show({
      type: 'info',
      text1: 'Syncing...',
      text2: 'Fetching health data from Health Connect',
    });

    try {
      const result = await syncAll({
        authToken,
        onProgress: ({ current, total, phase, currentType }) => {
          if (phase === 'syncing' && currentType) {
            Toast.show({
              type: 'info',
              text1: 'Syncing...',
              text2: `${currentType}: ${current}/${total} records`,
              autoHide: false,
            });
          }
        }
      });
      
      Toast.hide();
      Toast.show({
        type: 'success',
        text1: 'Sync Complete',
        text2: `${result.total} records synced successfully`,
      });
      
      EventEmitter.emit('SYNC_COMPLETED', {
        timestamp: result.timestamp,
        total: result.total
      });
      
      if (onSuccess) {
        onSuccess(result.timestamp);
      }
    } catch (error) {
      console.error('Sync error:', error);
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: error.message || 'Could not sync health data',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleSync}
      disabled={loading}
      style={[styles.button, style]}
    >
      {loading ? (
        <ActivityIndicator color="#3B82F6" />
      ) : (
        <Text style={[styles.buttonText, textStyle]}>
          Sync
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});


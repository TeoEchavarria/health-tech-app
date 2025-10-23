import { StyleSheet, Text, View, TextInput, Switch, Modal, Linking, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  initialize,
  requestPermission,
  readRecords,
  readRecord,
  insertRecords,
  deleteRecordsByUuids
} from 'react-native-health-connect';
import { 
  isHealthConnectAvailable, 
  openHealthConnectInstallPage, 
  getAllPermissions 
} from './src/native/healthConnect';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import axios from 'axios';
import ReactNativeForegroundService from '@supersami/rn-foreground-service';
import {requestNotifications} from 'react-native-permissions';
import * as Sentry from '@sentry/react-native';
import messaging from '@react-native-firebase/messaging';
import {Notifications} from 'react-native-notifications';
import DateTimePicker, { useDefaultStyles } from 'react-native-ui-datepicker';
import config from './config';

// Import new modular services and components
import { syncAll } from './src/services/healthSync';
import { setAuthToken, setAuthFromLogin, clearSession, setAuthErrorHandler } from './src/services/api';
import { EventEmitter } from './src/utils/eventBus';
import DashboardView from './src/screens/DashboardView';
import FamilyScreen from './src/screens/FamilyScreen';
import NutritionDetailScreen from './src/screens/NutritionDetailScreen';

// React Navigation imports
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();


const setObj = async (key, value) => { try { const jsonValue = JSON.stringify(value); await AsyncStorage.setItem(key, jsonValue) } catch (e) { console.log(e) } }
const setPlain = async (key, value) => { try { await AsyncStorage.setItem(key, value) } catch (e) { console.log(e) } }
const get = async (key) => { try { const value = await AsyncStorage.getItem(key); if (value !== null) { try { return JSON.parse(value) } catch { return value } } } catch (e) { console.log(e) } }
const delkey = async (key, value) => { try { await AsyncStorage.removeItem(key) } catch (e) { console.log(e) } }
const getAll = async () => { try { const keys = await AsyncStorage.getAllKeys(); return keys } catch (error) { console.error(error) } }


Notifications.setNotificationChannel({
  channelId: 'push-errors',
  name: 'Push Errors',
  importance: 5,
  description: 'Alerts for push errors',
  groupId: 'push-errors',
  groupName: 'Errors',
  enableLights: true,
  enableVibration: true,
  showBadge: true,
  vibrationPattern: [200, 1000, 500, 1000, 500],
})

let isSentryEnabled = true;
get('sentryEnabled')
  .then(res => {
    if (res != "false") {
      Sentry.init({
        dsn: 'https://e4a201b96ea602d28e90b5e4bbe67aa6@sentry.shuchir.dev/6',
        // enableSpotlight: __DEV__,
      });
      Toast.show({
        type: 'success',
        text1: "Sentry enabled from settings",
      });
    } else {
      isSentryEnabled = false;
      Toast.show({
        type: 'info',
        text1: "Sentry is disabled",
      });
    }
  })
  .catch(err => {
    console.log(err);
    Toast.show({
      type: 'error',
      text1: "Failed to check Sentry settings",
    });
  });
ReactNativeForegroundService.register();

const requestUserPermission = async () => {
  try {
    await messaging().requestPermission();
    const token = await messaging().getToken();
    console.log('Device Token:', token);
    return token;
  } catch (error) {
    console.log('Permission or Token retrieval error:', error);
  }
};

messaging().setBackgroundMessageHandler(async remoteMessage => {
  if (remoteMessage.data.op == "PUSH") handlePush(remoteMessage.data);
  if (remoteMessage.data.op == "DEL") handleDel(remoteMessage.data);
});

messaging().onMessage(remoteMessage => {
  if (remoteMessage.data.op == "PUSH") handlePush(remoteMessage.data);
  if (remoteMessage.data.op == "DEL") handleDel(remoteMessage.data);
});

let login;
let apiBase = config.apiBaseUrl; // Read from config file
let lastSync = null;
let taskDelay = config.defaultSyncIntervalHours * 60 * 60 * 1000; // Convert hours to milliseconds
let fullSyncMode = config.defaultFullSyncMode; // Default to full 30-day sync

get('login')
.then(res => {
  if (res) {
    login = res;
  }
})

get('lastSync')
.then(res => {
  if (res) {
    lastSync = res;
  }
})

get('fullSyncMode')
.then(res => {
  if (res !== null) {
    fullSyncMode = res === 'true';
  }
})

const askForPermissions = async () => {
  try {
    // Check if Health Connect is available
    const { available } = await isHealthConnectAvailable();
    
    if (!available) {
      Toast.show({
        type: 'error',
        text1: "Health Connect Not Available",
        text2: "Tap to install Health Connect from Play Store.",
        onPress: () => openHealthConnectInstallPage(),
        visibilityTime: 6000
      });
      return;
    }

    // Initialize Health Connect
    await initialize();

    // Request all permissions using the helper function
    const allPermissions = getAllPermissions();
    const grantedPermissions = await requestPermission(allPermissions);

    console.log('Granted permissions:', grantedPermissions);

    // Check if all permissions were granted
    if (grantedPermissions.length < allPermissions.length) {
      Toast.show({
        type: 'warning',
        text1: "Some Permissions Not Granted",
        text2: `${grantedPermissions.length}/${allPermissions.length} permissions granted. Please visit settings to grant all permissions.`,
        visibilityTime: 6000
      });
    } else {
      Toast.show({
        type: 'success',
        text1: "All Permissions Granted",
        text2: "You can now sync your health data.",
        visibilityTime: 3000
      });
    }
  } catch (error) {
    console.error('Error requesting permissions:', error);
    Toast.show({
      type: 'error',
      text1: "Permission Request Failed",
      text2: error.message || "An error occurred while requesting permissions."
    });
  }
};

/**
 * Manual token refresh function
 * NOTE: This is now OPTIONAL - the Axios interceptor automatically refreshes
 * tokens on 401/403 "invalid token" errors. This function can be kept for
 * proactive refresh, but is no longer required for the app to work.
 */
const refreshTokenFunc = async () => {
  let refreshToken = await get('refreshToken');
  if (!refreshToken) return;
  try {
    // This uses the API client which will auto-inject the current token
    let response = await axios.post(`${apiBase}/refresh`, {
      refresh: refreshToken
    });
    if ('token' in response.data) {
      console.log('🔄 Manual token refresh successful');
      await setAuthFromLogin(response.data);
      login = response.data.token;
      // Toast removed to avoid spam since refresh happens automatically
    }
    else {
      console.warn('⚠️ Manual token refresh failed - missing token in response');
      login = null;
      delkey('login');
    }
  }
  catch (err) {
    console.error('❌ Manual token refresh error:', err.message);
    // Don't clear session here - let the interceptor handle it
  }
}

const sync = async (customStartTime, customEndTime) => {
  await initialize();
  console.log("Syncing data...");
  let numRecords = 0;
  let numRecordsSynced = 0;
  Toast.show({
    type: 'info',
    text1: customStartTime ? "Syncing from custom time..." : "Syncing data...",
  })
  
  const currentTime = new Date().toISOString();
  
  let startTime;
  if (customStartTime) {
    startTime = customStartTime;
  } else if (fullSyncMode) {
    startTime = String(new Date(new Date().setDate(new Date().getDate() - 29)).toISOString());
  } else {
    if (lastSync) 
      startTime = lastSync;
    else 
      startTime = String(new Date(new Date().setDate(new Date().getDate() - 29)).toISOString());
  }
  
  if (!customStartTime) {
    await setPlain('lastSync', currentTime);
    lastSync = currentTime;
  }

  let recordTypes = ["ActiveCaloriesBurned", "BasalBodyTemperature", "BloodGlucose", "BloodPressure", "BasalMetabolicRate", "BodyFat", "BodyTemperature", "BoneMass", "CyclingPedalingCadence", "CervicalMucus", "ExerciseSession", "Distance", "ElevationGained", "FloorsClimbed", "HeartRate", "Height", "Hydration", "LeanBodyMass", "MenstruationFlow", "MenstruationPeriod", "Nutrition", "OvulationTest", "OxygenSaturation", "Power", "RespiratoryRate", "RestingHeartRate", "SleepSession", "Speed", "Steps", "StepsCadence", "TotalCaloriesBurned", "Vo2Max", "Weight", "WheelchairPushes"]; 
  
  for (let i = 0; i < recordTypes.length; i++) {
      let records;
      try {
        console.log(`Reading records for ${recordTypes[i]} from ${startTime} to ${new Date().toISOString()}`);
      records = await readRecords(recordTypes[i],
        {
          timeRangeFilter: {
            operator: "between",
            startTime: startTime,
            endTime: customEndTime ? customEndTime : String(new Date().toISOString())
          }
        }
      );

      records = records.records;
      }
      catch (err) {
        console.log(err)
        continue;
      }
      console.log(recordTypes[i]);
      numRecords += records.length;

      if (['SleepSession', 'Speed', 'HeartRate'].includes(recordTypes[i])) {
        console.log("INSIDE IF - ", recordTypes[i])
        for (let j=0; j<records.length; j++) {
          console.log("INSIDE FOR", j, recordTypes[i])
          setTimeout(async () => {
            try {
              let record = await readRecord(recordTypes[i], records[j].metadata.id);
              await axios.post(`${apiBase}/sync/${recordTypes[i]}`, {
                data: record
              }, {
                headers: {
                  "Authorization": `Bearer ${login}`
                }
              })
            }
            catch (err) {
              console.log(err)
            }

            numRecordsSynced += 1;
            try {
            ReactNativeForegroundService.update({
              id: 1244,
              title: 'Hacking Health Sync Progress',
              message: `Hacking Health is currently syncing... [${numRecordsSynced}/${numRecords}]`,
              icon: 'ic_launcher',
              setOnlyAlertOnce: true,
              color: '#000000',
              progress: {
                max: numRecords,
                curr: numRecordsSynced,
              }
            })

            if (numRecordsSynced == numRecords) {
              ReactNativeForegroundService.update({
                id: 1244,
                title: 'Hacking Health Sync Progress',
                message: `Hacking Health is working in the background to sync your data.`,
                icon: 'ic_launcher',
                setOnlyAlertOnce: true,
                color: '#000000',
              })
            }
            }
            catch {}
          }, j*3000)
        }
      }

      else {
        await axios.post(`${apiBase}/sync/${recordTypes[i]}`, {
          data: records
        }, {
          headers: {
            "Authorization": `Bearer ${login}`
          }
        });
        numRecordsSynced += records.length;
        try {
        ReactNativeForegroundService.update({
          id: 1244,
          title: 'Hacking Health Sync Progress',
          message: `Hacking Health is currently syncing... [${numRecordsSynced}/${numRecords}]`,
          icon: 'ic_launcher',
          setOnlyAlertOnce: true,
          color: '#000000',
          progress: {
            max: numRecords,
            curr: numRecordsSynced,
          }
        })

        if (numRecordsSynced == numRecords) {
          ReactNativeForegroundService.update({
            id: 1244,
            title: 'Hacking Health Sync Progress',
            message: `Hacking Health is working in the background to sync your data.`,
            icon: 'ic_launcher',
            setOnlyAlertOnce: true,
            color: '#000000',
          })
        }
        }
        catch {}
      }
  }
}

const handlePush = async (message) => {
  await initialize();
  
  let data = JSON.parse(message.data);
  console.log(data);

  insertRecords(data)
  .then((ids) => {
    console.log("Records inserted successfully: ", { ids });
    
    // Emit event to update UI
    EventEmitter.emit('PUSH_RECEIVED', {
      type: data[0]?.recordType,
      count: ids.length
    });
    EventEmitter.emit('SYNC_COMPLETED', {
      timestamp: new Date().toISOString(),
      detail: 'push'
    });
  })
  .catch((error) => {
    Notifications.postLocalNotification({
      body: "Error: " + error.message,
      title: `Push failed for ${data[0].recordType}`,
      silent: false,
      category: "Push Errors",
      fireDate: new Date(),
      android_channel_id: 'push-errors',
    });
  })
}

const handleDel = async (message) => {
  await initialize();
  
  let data = JSON.parse(message.data);
  console.log(data);

  deleteRecordsByUuids(data.recordType, data.uuids, data.uuids)
  axios.delete(`${apiBase}/sync/${data.recordType}`, {
    data: {
      uuid: data.uuids,
    },
    headers: {
      "Authorization": `Bearer ${login}`
    }
  })
  .then(() => {
    // Emit event to update UI
    EventEmitter.emit('DELETE_RECEIVED', {
      type: data.recordType,
      count: data.uuids.length
    });
    EventEmitter.emit('SYNC_COMPLETED', {
      timestamp: new Date().toISOString(),
      detail: 'delete'
    });
  })
  .catch((error) => {
    console.error('Delete error:', error);
  });
}
  
// Settings Screen Component
function SettingsScreen() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [showSyncWarning, setShowSyncWarning] = React.useState(false);
  const [customStartDate, setcustomStartDate] = React.useState(new Date());
  const [customEndDate, setcustomEndDate] = React.useState(new Date());
  const [useCustomDates, setUseCustomDates] = React.useState(false);
  const [showDatePickerModal, setShowDatePickerModal] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const defaultCalStyles = useDefaultStyles();

  const formatDateToReadable = (date) => {
    if (!date) return 'Not set';
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const formatDateToISOString = (date) => {
    const d = new Date(date);
    return d.toISOString();
  };

  return (
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.mainContent}>
        {/* Header Section */}
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>Hacking Health</Text>
          <Text style={styles.headerSubtitle}>Health Connect Sync</Text>
        </View>

        {/* Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sync Status</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusIndicator} />
            <Text style={styles.statusText}>Connected</Text>
          </View>
          <Text style={styles.lastSyncText}>
            Last Sync: {lastSync ? new Date(lastSync).toLocaleString() : 'Never'}
          </Text>
        </View>

        {/* Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>Sync Interval</Text>
              <Text style={styles.settingDescription}>How often to sync data</Text>
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.modernInput}
                placeholder="Hours"
                keyboardType='numeric'
                defaultValue={(taskDelay / (1000 * 60 * 60)).toString()}
                onChangeText={text => {
                  const hours = Number(text);
                  taskDelay = hours * 60 * 60 * 1000; 
                  setPlain('taskDelay', String(taskDelay));
                  ReactNativeForegroundService.update_task(() => sync(), {
                    delay: taskDelay,
                  })
                  Toast.show({
                    type: 'success',
                    text1: `Sync interval updated to ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
                  })
                }}
              />
              <Text style={styles.inputUnit}>hrs</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>Full 30-day Sync</Text>
              <Text style={styles.settingDescription}>Sync all data or incremental</Text>
            </View>
            <Switch
              value={fullSyncMode}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={fullSyncMode ? '#3B82F6' : '#F3F4F6'}
              onValueChange={async (value) => {
                if (!value) {
                  setShowSyncWarning(true);
                } else {
                  fullSyncMode = value;
                  await setPlain('fullSyncMode', value.toString());
                  Toast.show({
                    type: 'info',
                    text1: "Sync mode updated",
                    text2: "Will sync full 30 days of data"
                  });
                  forceUpdate();
                }
              }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>Error Tracking</Text>
              <Text style={styles.settingDescription}>Enable Sentry monitoring</Text>
            </View>
            <Switch
              value={isSentryEnabled}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isSentryEnabled ? '#3B82F6' : '#F3F4F6'}
              onValueChange={async (value) => {
                if (value) {
                  Sentry.init({
                    dsn: config.sentryDsn,
                    tracesSampleRate: 1.0,
                  });
                  Toast.show({
                    type: 'success',
                    text1: "Sentry enabled",
                  });
                  isSentryEnabled = true;
                  forceUpdate();
                } else {
                  Sentry.close();
                  Toast.show({
                    type: 'success',
                    text1: "Sentry disabled",
                  });
                  isSentryEnabled = false;
                  forceUpdate();
                }
                await setPlain('sentryEnabled', value.toString());
              }}
            />
          </View>
        </View>

        {/* Warning Card */}
        {showSyncWarning && (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>⚠️ Warning</Text>
            <Text style={styles.warningText}>
              Incremental sync only syncs data since the last sync. 
              You may miss data if the app stops abruptly.
            </Text>
            <View style={styles.warningButtons}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => setShowSyncWarning(false)}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonWarning]}
                onPress={async () => {
                  fullSyncMode = false;
                  await setPlain('fullSyncMode', 'false');
                  setShowSyncWarning(false);
                  Toast.show({
                    type: 'info',
                    text1: "Sync mode updated",
                    text2: "Will only sync data since last sync"
                  });
                  forceUpdate();
                }}
              >
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sync Range Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Custom Sync Range</Text>
          <View style={styles.dateRangeContainer}>
            <View style={styles.dateDisplay}>
              <Text style={styles.dateLabel}>From</Text>
              <Text style={styles.dateValue}>
                {formatDateToReadable(customStartDate)}
              </Text>
            </View>
            <Text style={styles.dateSeparator}>→</Text>
            <View style={styles.dateDisplay}>
              <Text style={styles.dateLabel}>To</Text>
              <Text style={styles.dateValue}>
                {formatDateToReadable(customEndDate)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { marginTop: 12 }]}
            onPress={() => setShowDatePickerModal(true)}
          >
            <Text style={styles.buttonSecondaryText}>Select Dates</Text>
          </TouchableOpacity>
        </View>

        {/* Date Picker Modal */}
        <Modal
          visible={showDatePickerModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDatePickerModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Date Range</Text>
              
              <DateTimePicker
                mode="range"
                maxDate={new Date()}
                startDate={customStartDate}
                endDate={customEndDate}
                onChange={(...dates) => {
                  setUseCustomDates(true);
                  if (dates[0].startDate) setcustomStartDate(dates[0].startDate);
                  if (dates[0].endDate) setcustomEndDate(dates[0].endDate);
                }}
                styles={defaultCalStyles}
              />
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.buttonSecondary, { flex: 1, marginRight: 8 }]}
                  onPress={() => setShowDatePickerModal(false)}
                >
                  <Text style={styles.buttonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.buttonPrimary, { flex: 1, marginLeft: 8 }]}
                  onPress={() => {
                    setUseCustomDates(true);
                    setShowDatePickerModal(false);
                  }}
                >
                  <Text style={styles.buttonText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Action Buttons */}
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => {
            if (!useCustomDates) {
              sync();
            }
            else if (customStartDate && customEndDate) {
              sync(formatDateToISOString(customStartDate), formatDateToISOString(customEndDate));
            }
          }}
        >
          <Text style={styles.buttonText}>
            {useCustomDates ? "Sync Selected Range" : "Sync Now"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonDanger]}
          onPress={() => {
            delkey('login');
            delkey('username');
            login = null;
            Toast.show({
              type: 'success',
              text1: "Logged out successfully",
            })
          }}
        >
          <Text style={styles.buttonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

export default Sentry.wrap(function App() {
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const [form, setForm] = React.useState(null);
  const [username, setUsername] = React.useState('');

  const loginFunc = async () => {
    Toast.show({
      type: 'info',
      text1: "Logging in...",
      autoHide: false
    })

    console.log('=== LOGIN DEBUG ===');
    console.log('API Base URL:', apiBase);
    console.log('Full login URL:', `${apiBase}/login`);
    console.log('Form data:', form);

    try {
    let fcmToken = await requestUserPermission();
    form.fcmToken = fcmToken;
    console.log('FCM Token:', fcmToken);
    console.log('Sending POST request to:', `${apiBase}/login`);
    console.log('Request payload:', form);
    
    let response = await axios.post(`${apiBase}/login`, form);
    
    console.log('Response received:', response.data);
    console.log('Response status:', response.status);
    
    if ('token' in response.data) {
      console.log('Login successful! Token received');
      
      // ✅ Use new helper to normalize and save tokens
      await setAuthFromLogin(response.data);
      
      // Backward compatibility - keep global login variable
      login = response.data.token;
      
      if (form.username) {
        setUsername(form.username);
        await setPlain('username', form.username);
      }
      forceUpdate();
      Toast.hide();
      Toast.show({
        type: 'success',
        text1: "Logged in successfully",
      })
      askForPermissions();
    }
    else {
      console.log('Login failed - no token in response:', response.data);
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: "Login failed",
        text2: response.data.error
      })
    }
    }

    catch (err) {
      console.log('=== LOGIN ERROR ===');
      console.log('Error message:', err.message);
      console.log('Error response:', err.response?.data);
      console.log('Error status:', err.response?.status);
      console.log('Full error:', err);
      Toast.hide();
      Toast.show({
        type: 'error',
        text1: "Login failed",
        text2: err.message
      })
    }
  }

  // Handle deep link for Google Assistant App Actions
  const handleDeepLink = (url) => {
    console.log('Deep link received:', url);
    
    if (!url) return;
    
    // Check if the deep link is for syncing health data
    if (url.includes('echavarrias://sync_health')) {
      console.log('Triggering health data sync from Google Assistant...');
      
      // Check if user is logged in before syncing
      if (login) {
        Toast.show({
          type: 'info',
          text1: 'Google Assistant',
          text2: 'Syncing your health data...',
        });
        
        // Call the sync function
        sync()
          .then(() => {
            Toast.show({
              type: 'success',
              text1: 'Sync Complete',
              text2: 'Your health data has been synced successfully.',
            });
          })
          .catch((error) => {
            console.error('Sync error:', error);
            Toast.show({
              type: 'error',
              text1: 'Sync Failed',
              text2: 'Could not sync your health data.',
            });
          });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Not Logged In',
          text2: 'Please log in to sync your health data.',
        });
      }
    }
  };

  // Effect for deep link handling
  React.useEffect(() => {
    // Handle deep link when app is opened from closed state
    Linking.getInitialURL()
      .then(url => {
        if (url) {
          console.log('App opened with URL:', url);
          handleDeepLink(url);
        }
      })
      .catch(err => console.error('Error getting initial URL:', err));

    // Handle deep link when app is already running
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link event:', event.url);
      handleDeepLink(event.url);
    });

    // Cleanup listener on unmount
    return () => {
      subscription.remove();
    };
  }, [login]);

  // Set up auth error handler (called when token refresh fails)
  React.useEffect(() => {
    setAuthErrorHandler((error) => {
      console.error('🚨 Authentication failed:', error.message);
      Toast.show({
        type: 'error',
        text1: 'Session Expired',
        text2: 'Please log in again.',
        visibilityTime: 5000
      });
      // Clear session and return to login
      login = null;
      forceUpdate();
    });
  }, []);

  React.useEffect(() => {
    requestNotifications(['alert']).then(({status, settings}) => {
      console.log(status, settings)
    });

    get('login')
    .then(res => {
      if (res) {
        login = res;
        // ✅ Token will be auto-injected by interceptor
        // Still set for backward compatibility
        setAuthToken(res);
        
        // Load username if available
        get('username').then(savedUsername => {
          if (savedUsername) setUsername(savedUsername);
        });
        
        get('taskDelay')
        .then(res => {
          if (res) taskDelay = Number(res);
        })
        
        ReactNativeForegroundService.add_task(() => sync(), {
          delay: taskDelay,
          onLoop: true,
          taskId: 'hacking-health_sync',
          onError: e => console.log(`Error logging:`, e),
        });

        ReactNativeForegroundService.add_task(() => refreshTokenFunc(), {
          delay: 10800 * 1000,
          onLoop: true,
          taskId: 'refresh_token',
          onError: e => console.log(`Error logging:`, e),
        });

        ReactNativeForegroundService.start({
          id: 1244,
          title: 'Hacking Health Sync Service',
          message: 'Hacking Health is working in the background to sync your data.',
          icon: 'ic_launcher',
          setOnlyAlertOnce: true,
          color: '#000000',
        }).then(() => console.log('Foreground service started'));

        forceUpdate()
      }
    })
  }, [login])

  return (
    <View style={styles.container}>
      {!login ? (
        // Login Screen
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.mainContent}>
            {/* Login View */}
            <View style={styles.loginHeader}>
              <Text style={styles.loginTitle}>Welcome</Text>
              <Text style={styles.loginSubtitle}>
                Sign in to sync your health data
              </Text>
            </View>

            {/* Login Card */}
            <View style={styles.card}>
              <Text style={styles.infoText}>
                If you don't have an account, one will be created automatically
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Username</Text>
                <TextInput
                  style={styles.modernInput}
                  placeholder="Enter your username"
                  placeholderTextColor="#9CA3AF"
                  onChangeText={text => setForm({ ...form, username: text })}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.modernInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={true}
                  onChangeText={text => setForm({ ...form, password: text })}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingLabelContainer}>
                  <Text style={styles.settingLabel}>Error Tracking</Text>
                  <Text style={styles.settingDescription}>Enable Sentry monitoring</Text>
                </View>
                <Switch
                  value={isSentryEnabled}
                  defaultValue={isSentryEnabled}
                  trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                  thumbColor={isSentryEnabled ? '#3B82F6' : '#F3F4F6'}
                  onValueChange={async (value) => {
                    if (value) {
                      Sentry.init({
                        dsn: config.sentryDsn,
                      });
                      Toast.show({
                        type: 'success',
                        text1: "Sentry enabled",
                      });
                      isSentryEnabled = true;
                      forceUpdate();
                    } else {
                      Sentry.close();
                      Toast.show({
                        type: 'success',
                        text1: "Sentry disabled",
                      });
                      isSentryEnabled = false;
                      forceUpdate();
                    }
                    await setPlain('sentryEnabled', value.toString());
                  }} 
                />
              </View>

              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, { marginTop: 20 }]}
                onPress={() => loginFunc()}
              >
                <Text style={styles.buttonText}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      ) : (
        // Logged In - Show Tab Navigator
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              tabBarActiveTintColor: '#007AFF',
              tabBarInactiveTintColor: '#8E8E93',
              tabBarStyle: {
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                borderTopWidth: 0,
                height: 70,
                paddingBottom: 12,
                paddingTop: 12,
                paddingHorizontal: 16,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 8,
              },
              tabBarLabelStyle: {
                fontSize: 11,
                fontWeight: '500',
                marginTop: 4,
                letterSpacing: 0.2,
              },
              tabBarIconStyle: {
                marginTop: 2,
              },
              headerShown: false,
            }}
          >
            <Tab.Screen 
              name="Dashboard" 
              component={DashboardView}
              options={{
                tabBarLabel: 'Dashboard',
                tabBarIcon: ({ color, focused }) => (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ 
                      fontSize: 20, 
                      color, 
                      fontWeight: focused ? '600' : '400',
                      opacity: focused ? 1 : 0.7
                    }}>📊</Text>
                  </View>
                ),
              }}
            />
            <Tab.Screen 
              name="Familias" 
              component={FamilyScreen}
              options={{
                tabBarLabel: 'Familias',
                tabBarIcon: ({ color, focused }) => (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ 
                      fontSize: 20, 
                      color, 
                      fontWeight: focused ? '600' : '400',
                      opacity: focused ? 1 : 0.7
                    }}>👨‍👩‍👧‍👦</Text>
                  </View>
                ),
              }}
            />
            <Tab.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{
                tabBarLabel: 'Settings',
                tabBarIcon: ({ color, focused }) => (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ 
                      fontSize: 20, 
                      color, 
                      fontWeight: focused ? '600' : '400',
                      opacity: focused ? 1 : 0.7
                    }}>⚙️</Text>
                  </View>
                ),
              }}
            />
            <Tab.Screen 
              name="NutritionDetail" 
              component={NutritionDetailScreen}
              options={{
                tabBarLabel: 'Nutrition',
                tabBarIcon: ({ color, focused }) => (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ 
                      fontSize: 20, 
                      color, 
                      fontWeight: focused ? '600' : '400',
                      opacity: focused ? 1 : 0.7
                    }}>🍽️</Text>
                  </View>
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      )}

      <StatusBar style="dark" />
      <Toast />
    </View>
  );
});;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  
  scrollView: {
    flex: 1,
  },
  
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  
  mainContent: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },

  // Header Styles
  headerCard: {
    backgroundColor: '#667eea',
    borderRadius: 20,
    padding: 32,
    marginBottom: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  
  headerSubtitle: {
    fontSize: 16,
    color: '#E0E7FF',
    fontWeight: '500',
  },

  // Card Styles
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },

  // Status Styles
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    marginRight: 10,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
  
  lastSyncText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },

  // Settings Styles
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  
  settingLabelContainer: {
    flex: 1,
    marginRight: 16,
  },
  
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  
  settingDescription: {
    fontSize: 13,
    color: '#6B7280',
  },

  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },

  // Input Styles
  inputGroup: {
    marginBottom: 16,
  },
  
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  
  modernInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    minWidth: 80,
  },
  
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  inputUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },

  // Button Styles
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  
  buttonPrimary: {
    backgroundColor: '#3B82F6',
  },
  
  buttonSecondary: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  
  buttonDanger: {
    backgroundColor: '#EF4444',
  },
  
  buttonWarning: {
    backgroundColor: '#F59E0B',
  },
  
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  
  buttonSecondaryText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },

  // Warning Card Styles
  warningCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  
  warningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 8,
  },
  
  warningText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
    marginBottom: 16,
  },
  
  warningButtons: {
    flexDirection: 'row',
    gap: 12,
  },

  // Date Range Styles
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  
  dateDisplay: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  
  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  
  dateValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  
  dateSeparator: {
    fontSize: 20,
    color: '#9CA3AF',
    marginHorizontal: 12,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
  },

  // Login Styles
  loginHeader: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  
  loginTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  
  loginSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 24,
    textAlign: 'center',
  },

  // Dashboard Styles
  dashboardHeader: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 40,
  },
  
  dashboardTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  
  dashboardSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },

  dashboardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    alignItems: 'center',
  },

  dashboardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },

  dashboardIcon: {
    fontSize: 40,
  },

  dashboardWelcomeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 26,
  },

  dashboardInfoText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  syncButton: {
    marginTop: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  syncingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutLink: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },

  logoutLinkText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
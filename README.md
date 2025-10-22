# 🏥 HACKING HEALTH - HCGateway

<div align="center">

![Health Connect](https://img.shields.io/badge/Health%20Connect-Android%20API-blue?style=for-the-badge&logo=android)
![REST API](https://img.shields.io/badge/REST%20API-FastAPI-green?style=for-the-badge&logo=fastapi)
![React Native](https://img.shields.io/badge/Mobile-React%20Native-61DAFB?style=for-the-badge&logo=react)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb)

**Unlock the power of Android Health Connect data through a simple REST API**

[📖 API Documentation](https://hcgateway.shuchir.dev/) • [🚀 Quick Start](#-quick-start) • [📱 Download App](#-mobile-application)

</div>

## 🎯 What is HACKING HEALTH?

**HACKING HEALTH** is a revolutionary platform that bridges the gap between Android's Health Connect API and developers who want to build health-focused applications. Instead of dealing with complex Android development, you can now access comprehensive health data through simple REST API calls.

### 🔥 Why HACKING HEALTH?

- **🚀 No Android Development Required**: Access health data without writing a single line of Android code
- **📊 Comprehensive Health Data**: 30+ health metrics including heart rate, nutrition, sleep, exercise, and more
- **🔄 Real-time Sync**: Automatic data synchronization every 2 hours with manual sync options
- **🔒 Privacy First**: End-to-end encryption with Fernet encryption and Argon2 password hashing
- **🌐 REST API**: Simple HTTP endpoints that work with any programming language
- **📱 Cross-Platform**: Works with any app that can make HTTP requests

### 🎯 Perfect For

- **Health & Fitness Apps**: Build nutrition trackers, workout apps, or wellness dashboards
- **Research Projects**: Collect anonymized health data for medical research
- **Personal Health Tools**: Create custom health monitoring solutions
- **IoT Integration**: Connect health data with smart home devices
- **Data Analytics**: Analyze health trends and patterns

<a href="https://www.buymeacoffee.com/shuchir" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a> 

> [!NOTE]
> 🚧 **Coming Soon**: We're working on a lighter version that runs entirely within the app, eliminating the need for external servers. Stay tuned for this game-changing update!

## 🚀 Quick Start

### The Problem
Building health applications on Android traditionally requires:
- Complex Android development knowledge
- Direct integration with Health Connect API
- Managing permissions and data synchronization
- Platform-specific code that doesn't work elsewhere

### The Solution
**HACKING HEALTH** simplifies this by providing:
- A simple REST API that works with any programming language
- Automatic data synchronization from Android devices
- Encrypted data storage and transmission
- Cross-platform compatibility

## 🏗️ How It Works

The platform consists of two main components:

### 📱 Mobile Application (Android)
- **Automatic Sync**: Pings the server every 2 hours to send health data
- **Foreground Service**: Runs continuously, even when the app is closed
- **Manual Sync**: Force sync anytime through the app interface
- **Data Collection**: Gathers 30+ health metrics from Health Connect

### 🌐 REST API Server
- **Data Processing**: Receives, encrypts, and stores health data
- **API Endpoints**: Provides secure access to user data
- **Authentication**: User login and token-based access
- **Encryption**: Fernet encryption for data security

> [!NOTE]
> 🚧 **Development Status**: This project is actively developed. The API may change without notice. The mobile application is in development and may not work as expected. Please report any issues you find.

> [!IMPORTANT]
> 🔄 **Database Migration**: The database was recently migrated from Appwrite to MongoDB. If you were using the Appwrite version, you will need to migrate your data to the new database. You can find the migration script in the `scripts/` folder. You will need to install the `appwrite` and `pymongo` libraries to run the script, then run the script with the following command: `python3 migrate_1.5.0.py`.

## 📊 Supported Health Data Types

The mobile application automatically syncs **30+ health metrics** every 2 hours. Here's what you can access:

### 🏃‍♂️ Fitness & Activity
- **Active Calories Burned** (`activeCaloriesBurned`)
- **Total Calories Burned** (`totalCaloriesBurned`)
- **Distance** (`distance`)
- **Steps** (`steps`)
- **Steps Cadence** (`stepsCadence`)
- **Exercise Sessions** (`exerciseSession`)
- **Elevation Gained** (`elevationGained`)
- **Floors Climbed** (`floorsClimbed`)
- **Speed** (`speed`)
- **Power** (`power`)
- **Wheelchair Pushes** (`wheelchairPushes`)

### ❤️ Cardiovascular
- **Heart Rate** (`heartRate`)
- **Resting Heart Rate** (`restingHeartRate`)
- **Blood Pressure** (`bloodPressure`)
- **VO2 Max** (`vo2Max`)
- **Respiratory Rate** (`respiratoryRate`)
- **Oxygen Saturation** (`oxygenSaturation`)

### 🍎 Nutrition & Body Composition
- **Nutrition** (`nutrition`)
- **Weight** (`weight`)
- **Height** (`height`)
- **Body Fat** (`bodyFat`)
- **Lean Body Mass** (`leanBodyMass`)
- **Bone Mass** (`boneMass`)
- **Basal Metabolic Rate** (`basalMetabolicRate`)

### 🌡️ Vital Signs
- **Body Temperature** (`bodyTemperature`)
- **Basal Body Temperature** (`basalBodyTemperature`)
- **Blood Glucose** (`bloodGlucose`)

### 💧 Wellness
- **Hydration** (`hydration`)
- **Sleep Sessions** (`sleepSession`)

### 👩‍⚕️ Women's Health
- **Menstruation Flow** (`menstruationFlow`)
- **Menstruation Period** (`menstruationPeriod`)
- **Cervical Mucus** (`cervicalMucus`)
- **Ovulation Test** (`ovulationTest`)

### 🔄 Sync Details
- **Sync Frequency**: Every 2 hours (customizable)
- **Sync Duration**: Approximately 15 minutes per sync
- **Data Encryption**: Fernet encryption before storage
- **Storage**: MongoDB database with user-specific collections
- **Two-way Sync**: Make changes to Health Connect remotely via REST API

> [!NOTE]
> 🚀 **Expanding Support**: More health data types are planned for future releases. Check our [API documentation](https://hcgateway.shuchir.dev/) for the latest updates.

## 🚀 Get Started

### Option 1: Use Hosted Instance (Recommended for Testing)

1. **📱 Install the Mobile App**
   - Download the latest APK from the [releases section](https://github.com/your-repo/releases)
   - **Requirements**: Android Oreo (8.0) or higher
   - Install the APK on your Android device

2. **🔐 Create Your Account**
   - Open the app and sign up with a username and password
   - Note your User ID (displayed after successful signup)
   - Your data will automatically sync every 2 hours

3. **🌐 Access Your Data**
   - Use the hosted API at `https://api.hcgateway.shuchir.dev/`
   - Authenticate with your credentials
   - Start building your health application!

> [!IMPORTANT]
> ⚠️ **Hosted Instance Disclaimer**: Use the hosted instance at your own risk. By using the hosted server, you acknowledge all responsibility is waived from the server owner.

### Option 2: Self-Host (Recommended for Production)

For full control and privacy, you can host your own instance. See the [Self Hosting](#-self-hosting) section below.

## 📖 API Documentation

The complete REST API documentation is available at: **[https://hcgateway.shuchir.dev/](https://hcgateway.shuchir.dev/)**

### Quick API Example

```bash
# Login to get your access token
curl -X POST https://api.hcgateway.shuchir.dev/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'

# Get your health data
curl -X GET https://api.hcgateway.shuchir.dev/data/heartRate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🏗️ Technical Architecture

### 🔐 Security & Privacy
- **Password Encryption**: Argon2 hashing (passwords never stored in plain text)
- **Data Encryption**: Fernet encryption for all health data
- **Token-based Authentication**: JWT tokens for API access
- **User Isolation**: Each user's data is stored in separate collections

### 📊 Database Schema

#### Users Collection
```json
{
  "_id": "user_id",
  "username": "string",
  "password": "argon2_hash",
  "fcmToken": "firebase_token",
  "expiry": "datetime",
  "token": "jwt_access_token",
  "refresh": "jwt_refresh_token"
}
```

#### Health Data Collections
Each user has their own collection named `hcgateway_[user_id]`:

```json
{
  "dataType": "heartRate|steps|nutrition|...",
  "_id": "unique_record_id",
  "data": "encrypted_health_data",
  "id": "backward_compatibility_id",
  "start": "datetime",
  "end": "datetime",
  "app": "source_app_package"
}
```

#### Data Fields Explained
- **`_id`**: Unique identifier for the health record
- **`data`**: Encrypted health data (decrypted automatically by API)
- **`start/end`**: Time range for the health measurement
- **`app`**: Source application package name
- **`dataType`**: Type of health data (heartRate, steps, etc.)

### 📱 Mobile Application Details
- **Framework**: React Native
- **Service**: Foreground service for continuous operation
- **Sync**: Automatic every 2 hours (customizable)
- **Manual Sync**: Available through app interface
- **Background**: Runs even when app is closed

## 🏠 Self Hosting

For production use or full control over your data, you can host your own instance. This gives you complete privacy and customization options.

> [!IMPORTANT]
> 🔧 **Custom Mobile App Required**: If you want to use your own server, you must build the mobile application yourself since it's packaged with Firebase keys that can't be changed dynamically.

### 🐳 Docker Setup (Recommended)

#### Prerequisites
- Docker and Docker Compose installed
- Firebase project (for push notifications)

#### 1. Environment Configuration
```bash
# Copy environment template
cp api/.env.example api/.env

# Configure your settings in api/.env
# MONGO_URI format: mongodb://<username>:<password>@db:27017/hcgateway?authSource=admin
```

#### 2. Firebase Setup
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Add an Android app to your project
3. Download `google-services.json` and place in:
   - `firebase/` folder
   - `android/app/` folder
4. Generate service account key:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save as `service-account.json` in `api/` folder

#### 3. Start Services
```bash
# Start all services
docker-compose up -d

# Access API at http://localhost:6644
```

### 🛠️ Manual Setup

#### Server Setup
```bash
# Prerequisites: Python 3, MongoDB
git clone <repository>
cd api/

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Setup Firebase (same as Docker setup)
# Place service-account.json in api/ folder

# Start server
python3 main.py
```

#### Mobile App Build
```bash
# Prerequisites: Node.js 18+, Android Studio, Java 17
cd app/

# Install dependencies
npm install

# Optional: Remove Sentry
yarn remove @sentry/react-native
npx @sentry/wizard -i reactNative -p android --uninstall

# Optional: Configure custom Sentry
# Edit App.js, app.json, android/sentry.properties, AndroidManifest.xml

# Apply patches
npx patch-package

# Build APK
npm run android
# OR
cd android && ./gradlew assembleRelease

# Alternative: EAS Build (local only)
# https://docs.expo.dev/build/eas-build/
```

### 🔧 Configuration Options

#### Environment Variables
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: Secret for JWT token generation
- `ENCRYPTION_KEY`: Fernet encryption key
- `FIREBASE_PROJECT_ID`: Firebase project ID

#### Customization
- **Sync Frequency**: Modify sync interval in mobile app
- **Data Types**: Add/remove supported health metrics
- **API Endpoints**: Extend REST API functionality
- **Authentication**: Customize user management

## 💡 Use Cases & Examples

### 🏃‍♂️ Fitness Applications
```python
# Get user's daily steps
import requests

response = requests.get(
    'https://api.hcgateway.shuchir.dev/data/steps',
    headers={'Authorization': f'Bearer {access_token}'}
)
steps_data = response.json()
```

### 🍎 Nutrition Tracking
```javascript
// Fetch nutrition data for meal planning
const nutritionData = await fetch('/api/data/nutrition', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const meals = await nutritionData.json();
```

### 📊 Health Dashboards
```python
# Create a comprehensive health dashboard
health_metrics = ['heartRate', 'bloodPressure', 'weight', 'sleepSession']
dashboard_data = {}

for metric in health_metrics:
    response = requests.get(f'/api/data/{metric}', headers=auth_headers)
    dashboard_data[metric] = response.json()
```

### 🔬 Research & Analytics
- **Medical Research**: Collect anonymized health data for studies
- **Population Health**: Analyze health trends across user groups
- **Clinical Trials**: Monitor patient health metrics remotely
- **Wellness Programs**: Track employee health and fitness goals

### 🏠 Smart Home Integration
```python
# Connect health data to smart home devices
if heart_rate > 100:
    smart_home.set_lighting('relaxing')
    smart_home.play_music('calm')
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **🐛 Report Bugs**: Use GitHub Issues to report problems
2. **💡 Feature Requests**: Suggest new health data types or API improvements
3. **📝 Documentation**: Help improve our docs and examples
4. **🔧 Code Contributions**: Submit pull requests for bug fixes or features

### Development Setup
```bash
# Fork and clone the repository
git clone https://github.com/your-username/HCGateway.git
cd HCGateway

# Set up development environment
cd api && pip install -r requirements.txt
cd ../app && npm install

# Run tests and development server
npm run test
python3 api/main.py
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Health Connect API** by Google for providing comprehensive health data access
- **React Native** community for the mobile development framework
- **FastAPI** for the robust REST API framework
- **MongoDB** for reliable data storage
- **All contributors** who help make this project better

---

<div align="center">

**Made with ❤️ for the health tech community**

[⭐ Star this repo](https://github.com/your-repo/HCGateway) • [🐛 Report Issues](https://github.com/your-repo/HCGateway/issues) • [💬 Discussions](https://github.com/your-repo/HCGateway/discussions)

</div>

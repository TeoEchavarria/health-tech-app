# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Keep Wear OS and Wearable classes
-keep class com.google.android.gms.wearable.** { *; }
-keep class androidx.wear.** { *; }

# Keep sensor service
-keep class com.echavarrias.hcgateway.wear.SensorService { *; }
-keep class com.echavarrias.hcgateway.wear.DataLayerSender { *; }


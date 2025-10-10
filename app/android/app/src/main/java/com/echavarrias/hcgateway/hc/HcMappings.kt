// HcMappings.kt
// String to Health Connect class mapping with permissions
package com.echavarrias.hcgateway.hc

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.PowerRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsCadenceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.WheelchairPushesRecord
import kotlin.reflect.KClass

data class HcTypeInfo<T: Record>(
    val kClass: KClass<T>,
    val readPerm: String,
    val writePerm: String
)

val HC_TYPES: Map<String, HcTypeInfo<out Record>> = mapOf(
    "activeCaloriesBurned" to HcTypeInfo(
        ActiveCaloriesBurnedRecord::class,
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(ActiveCaloriesBurnedRecord::class)
    ),
    "basalBodyTemperature" to HcTypeInfo(
        BasalBodyTemperatureRecord::class,
        HealthPermission.getReadPermission(BasalBodyTemperatureRecord::class),
        HealthPermission.getWritePermission(BasalBodyTemperatureRecord::class)
    ),
    "basalMetabolicRate" to HcTypeInfo(
        BasalMetabolicRateRecord::class,
        HealthPermission.getReadPermission(BasalMetabolicRateRecord::class),
        HealthPermission.getWritePermission(BasalMetabolicRateRecord::class)
    ),
    "bloodGlucose" to HcTypeInfo(
        BloodGlucoseRecord::class,
        HealthPermission.getReadPermission(BloodGlucoseRecord::class),
        HealthPermission.getWritePermission(BloodGlucoseRecord::class)
    ),
    "bloodPressure" to HcTypeInfo(
        BloodPressureRecord::class,
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        HealthPermission.getWritePermission(BloodPressureRecord::class)
    ),
    "bodyFat" to HcTypeInfo(
        BodyFatRecord::class,
        HealthPermission.getReadPermission(BodyFatRecord::class),
        HealthPermission.getWritePermission(BodyFatRecord::class)
    ),
    "bodyTemperature" to HcTypeInfo(
        BodyTemperatureRecord::class,
        HealthPermission.getReadPermission(BodyTemperatureRecord::class),
        HealthPermission.getWritePermission(BodyTemperatureRecord::class)
    ),
    "boneMass" to HcTypeInfo(
        BoneMassRecord::class,
        HealthPermission.getReadPermission(BoneMassRecord::class),
        HealthPermission.getWritePermission(BoneMassRecord::class)
    ),
    "cervicalMucus" to HcTypeInfo(
        CervicalMucusRecord::class,
        HealthPermission.getReadPermission(CervicalMucusRecord::class),
        HealthPermission.getWritePermission(CervicalMucusRecord::class)
    ),
    "distance" to HcTypeInfo(
        DistanceRecord::class,
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class)
    ),
    "exerciseSession" to HcTypeInfo(
        ExerciseSessionRecord::class,
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(ExerciseSessionRecord::class)
    ),
    "elevationGained" to HcTypeInfo(
        ElevationGainedRecord::class,
        HealthPermission.getReadPermission(ElevationGainedRecord::class),
        HealthPermission.getWritePermission(ElevationGainedRecord::class)
    ),
    "floorsClimbed" to HcTypeInfo(
        FloorsClimbedRecord::class,
        HealthPermission.getReadPermission(FloorsClimbedRecord::class),
        HealthPermission.getWritePermission(FloorsClimbedRecord::class)
    ),
    "heartRate" to HcTypeInfo(
        HeartRateRecord::class,
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class)
    ),
    "height" to HcTypeInfo(
        HeightRecord::class,
        HealthPermission.getReadPermission(HeightRecord::class),
        HealthPermission.getWritePermission(HeightRecord::class)
    ),
    "hydration" to HcTypeInfo(
        HydrationRecord::class,
        HealthPermission.getReadPermission(HydrationRecord::class),
        HealthPermission.getWritePermission(HydrationRecord::class)
    ),
    "leanBodyMass" to HcTypeInfo(
        LeanBodyMassRecord::class,
        HealthPermission.getReadPermission(LeanBodyMassRecord::class),
        HealthPermission.getWritePermission(LeanBodyMassRecord::class)
    ),
    "menstruationFlow" to HcTypeInfo(
        MenstruationFlowRecord::class,
        HealthPermission.getReadPermission(MenstruationFlowRecord::class),
        HealthPermission.getWritePermission(MenstruationFlowRecord::class)
    ),
    "menstruationPeriod" to HcTypeInfo(
        MenstruationPeriodRecord::class,
        HealthPermission.getReadPermission(MenstruationPeriodRecord::class),
        HealthPermission.getWritePermission(MenstruationPeriodRecord::class)
    ),
    "nutrition" to HcTypeInfo(
        NutritionRecord::class,
        HealthPermission.getReadPermission(NutritionRecord::class),
        HealthPermission.getWritePermission(NutritionRecord::class)
    ),
    "ovulationTest" to HcTypeInfo(
        OvulationTestRecord::class,
        HealthPermission.getReadPermission(OvulationTestRecord::class),
        HealthPermission.getWritePermission(OvulationTestRecord::class)
    ),
    "oxygenSaturation" to HcTypeInfo(
        OxygenSaturationRecord::class,
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getWritePermission(OxygenSaturationRecord::class)
    ),
    "power" to HcTypeInfo(
        PowerRecord::class,
        HealthPermission.getReadPermission(PowerRecord::class),
        HealthPermission.getWritePermission(PowerRecord::class)
    ),
    "respiratoryRate" to HcTypeInfo(
        RespiratoryRateRecord::class,
        HealthPermission.getReadPermission(RespiratoryRateRecord::class),
        HealthPermission.getWritePermission(RespiratoryRateRecord::class)
    ),
    "restingHeartRate" to HcTypeInfo(
        RestingHeartRateRecord::class,
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getWritePermission(RestingHeartRateRecord::class)
    ),
    "sleepSession" to HcTypeInfo(
        SleepSessionRecord::class,
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getWritePermission(SleepSessionRecord::class)
    ),
    "speed" to HcTypeInfo(
        SpeedRecord::class,
        HealthPermission.getReadPermission(SpeedRecord::class),
        HealthPermission.getWritePermission(SpeedRecord::class)
    ),
    "steps" to HcTypeInfo(
        StepsRecord::class,
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getWritePermission(StepsRecord::class)
    ),
    "stepsCadence" to HcTypeInfo(
        StepsCadenceRecord::class,
        HealthPermission.getReadPermission(StepsCadenceRecord::class),
        HealthPermission.getWritePermission(StepsCadenceRecord::class)
    ),
    "totalCaloriesBurned" to HcTypeInfo(
        TotalCaloriesBurnedRecord::class,
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class)
    ),
    "vo2Max" to HcTypeInfo(
        Vo2MaxRecord::class,
        HealthPermission.getReadPermission(Vo2MaxRecord::class),
        HealthPermission.getWritePermission(Vo2MaxRecord::class)
    ),
    "weight" to HcTypeInfo(
        WeightRecord::class,
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getWritePermission(WeightRecord::class)
    ),
    "wheelchairPushes" to HcTypeInfo(
        WheelchairPushesRecord::class,
        HealthPermission.getReadPermission(WheelchairPushesRecord::class),
        HealthPermission.getWritePermission(WheelchairPushesRecord::class)
    )
)

// Get all canonical record type keys
fun getAllRecordTypeKeys(): List<String> = HC_TYPES.keys.toList()

// Check if a type is valid
fun isValidRecordType(type: String): Boolean = HC_TYPES.containsKey(type)


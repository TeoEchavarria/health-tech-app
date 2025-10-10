// Aggregators.kt
// Aggregation functions for different Health Connect record types
// These collapse many minute-level records into hour/day summaries
package com.echavarrias.hcgateway.hc

import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import java.time.ZoneOffset
import java.time.Duration

// --- HEART RATE (avg/min/max per bucket)
fun aggregateHeartRate(
    records: List<HeartRateRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val samples = recs.flatMap { it.samples }
        val values = samples.map { it.beatsPerMinute.toDouble() }
        val avg = if (values.isNotEmpty()) values.average() else 0.0
        val min = values.minOrNull() ?: 0.0
        val max = values.maxOrNull() ?: 0.0
        val bucketEnd = bucketStart.bucketEnd(granularity)

        mapOf(
            "type" to "heartRate",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "avgBpm" to avg,
                "minBpm" to min,
                "maxBpm" to max,
                "samples" to samples.size
            )
        )
    }
}

// --- STEPS (sum per bucket)
fun aggregateSteps(
    records: List<StepsRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val total = recs.sumOf { it.count }
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "steps",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf("totalSteps" to total)
        )
    }
}

// --- SLEEP SESSION (duration & stages per bucket)
fun aggregateSleep(
    records: List<SleepSessionRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val totalMinutes = recs.sumOf { 
            Duration.between(it.startTime, it.endTime).toMinutes() 
        }
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        val stages = recs
            .flatMap { it.stages }
            .groupBy { it.stage }
            .mapValues { (_, stageList) ->
                stageList.sumOf { 
                    Duration.between(it.startTime, it.endTime).toMinutes() 
                }
            }
        
        mapOf(
            "type" to "sleepSession",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "totalMinutes" to totalMinutes,
                "stagesMinutes" to stages
            )
        )
    }
}

// --- DISTANCE (sum meters per bucket)
fun aggregateDistance(
    records: List<DistanceRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val totalMeters = recs.sumOf { it.distance.inMeters }
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "distance",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf("totalMeters" to totalMeters)
        )
    }
}

// --- ACTIVE CALORIES BURNED (sum kcal per bucket)
fun aggregateActiveCalories(
    records: List<ActiveCaloriesBurnedRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val totalKcal = recs.sumOf { it.energy.inKilocalories }
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "activeCaloriesBurned",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf("totalKcal" to totalKcal)
        )
    }
}

// --- TOTAL CALORIES BURNED (sum kcal per bucket)
fun aggregateTotalCalories(
    records: List<TotalCaloriesBurnedRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val totalKcal = recs.sumOf { it.energy.inKilocalories }
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "totalCaloriesBurned",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf("totalKcal" to totalKcal)
        )
    }
}

// --- OXYGEN SATURATION (avg/min/max per bucket)
fun aggregateOxygenSaturation(
    records: List<OxygenSaturationRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.time.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val values = recs.map { it.percentage.value }
        val avg = if (values.isNotEmpty()) values.average() else 0.0
        val min = values.minOrNull() ?: 0.0
        val max = values.maxOrNull() ?: 0.0
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "oxygenSaturation",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "avgPercentage" to avg,
                "minPercentage" to min,
                "maxPercentage" to max,
                "samples" to values.size
            )
        )
    }
}

// --- HYDRATION (sum ml per bucket)
fun aggregateHydration(
    records: List<HydrationRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.startTime.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val totalMl = recs.sumOf { it.volume.inLiters * 1000 }
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "hydration",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf("totalMl" to totalMl)
        )
    }
}

// --- RESTING HEART RATE (avg per bucket)
fun aggregateRestingHeartRate(
    records: List<RestingHeartRateRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.time.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val values = recs.map { it.beatsPerMinute.toDouble() }
        val avg = if (values.isNotEmpty()) values.average() else 0.0
        val min = values.minOrNull() ?: 0.0
        val max = values.maxOrNull() ?: 0.0
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "restingHeartRate",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "avgBpm" to avg,
                "minBpm" to min,
                "maxBpm" to max,
                "samples" to values.size
            )
        )
    }
}

// --- WEIGHT (latest per bucket - instantaneous records)
fun aggregateWeight(
    records: List<WeightRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.time.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        // For weight, take the latest measurement in the bucket
        val latest = recs.maxByOrNull { it.time }
        val weightKg = latest?.weight?.inKilograms ?: 0.0
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "weight",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "weightKg" to weightKg,
                "measurementTime" to (latest?.time?.toString() ?: "")
            )
        )
    }
}

// --- BLOOD PRESSURE (avg/min/max per bucket)
fun aggregateBloodPressure(
    records: List<BloodPressureRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.time.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val systolicValues = recs.map { it.systolic.inMillimetersOfMercury }
        val diastolicValues = recs.map { it.diastolic.inMillimetersOfMercury }
        
        val avgSystolic = if (systolicValues.isNotEmpty()) systolicValues.average() else 0.0
        val avgDiastolic = if (diastolicValues.isNotEmpty()) diastolicValues.average() else 0.0
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "bloodPressure",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "avgSystolic" to avgSystolic,
                "avgDiastolic" to avgDiastolic,
                "samples" to recs.size
            )
        )
    }
}

// --- BLOOD GLUCOSE (avg/min/max per bucket)
fun aggregateBloodGlucose(
    records: List<BloodGlucoseRecord>,
    granularity: Granularity
): List<Map<String, Any?>> {
    val grouped = records.groupBy { 
        it.time.atZone(ZoneOffset.UTC).bucketStart(granularity) 
    }
    
    return grouped.map { (bucketStart, recs) ->
        val values = recs.map { it.level.inMillimolesPerLiter }
        val avg = if (values.isNotEmpty()) values.average() else 0.0
        val min = values.minOrNull() ?: 0.0
        val max = values.maxOrNull() ?: 0.0
        val bucketEnd = bucketStart.bucketEnd(granularity)
        
        mapOf(
            "type" to "bloodGlucose",
            "granularity" to granularity.toApiString(),
            "periodStart" to bucketStart.toInstant().toString(),
            "periodEnd" to bucketEnd.toInstant().toString(),
            "data" to mapOf(
                "avgMmolPerL" to avg,
                "minMmolPerL" to min,
                "maxMmolPerL" to max,
                "samples" to values.size
            )
        )
    }
}


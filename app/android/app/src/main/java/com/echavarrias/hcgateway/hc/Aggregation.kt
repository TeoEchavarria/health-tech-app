// Aggregation.kt
// Hour/Day bucketing helpers for time-based aggregation
package com.echavarrias.hcgateway.hc

import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

enum class Granularity {
    HOUR,
    DAY
}

// Get the start of the time bucket for a given timestamp
fun ZonedDateTime.bucketStart(granularity: Granularity): ZonedDateTime =
    when (granularity) {
        Granularity.HOUR -> this.truncatedTo(ChronoUnit.HOURS)
        Granularity.DAY  -> this.truncatedTo(ChronoUnit.DAYS)
    }

// Get the end of the time bucket for a given timestamp
fun ZonedDateTime.bucketEnd(granularity: Granularity): ZonedDateTime =
    when (granularity) {
        Granularity.HOUR -> this.bucketStart(granularity).plusHours(1)
        Granularity.DAY  -> this.bucketStart(granularity).plusDays(1)
    }

// Convert granularity to lowercase string for API
fun Granularity.toApiString(): String = this.name.lowercase()


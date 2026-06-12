package me.meeshy.sdk.util

import java.time.Instant
import java.time.OffsetDateTime

/**
 * Best-effort ISO-8601 → epoch-millis conversion; returns 0L when the value is
 * absent or unparseable. Shared by the Room-backed cache sources to derive a
 * sortable timestamp from the gateway's string dates.
 */
public fun isoToEpochMillis(value: String?): Long {
    if (value.isNullOrBlank()) return 0L
    return runCatching { Instant.parse(value).toEpochMilli() }
        .recoverCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }
        .getOrDefault(0L)
}

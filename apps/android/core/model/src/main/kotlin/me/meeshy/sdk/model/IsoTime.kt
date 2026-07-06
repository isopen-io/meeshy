package me.meeshy.sdk.model

import java.time.Instant
import java.time.OffsetDateTime

/**
 * Canonical best-effort ISO-8601 → epoch-millis conversion; returns 0L when the
 * value is absent or unparseable.
 *
 * Single source of truth for the gateway's string dates across the SDK: the
 * Room-backed cache sources reach it through the `me.meeshy.sdk.util` re-export,
 * the model layer (story grouping/expiry) calls it directly.
 */
public fun isoToEpochMillis(value: String?): Long {
    if (value.isNullOrBlank()) return 0L
    return runCatching { Instant.parse(value).toEpochMilli() }
        .recoverCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }
        .getOrDefault(0L)
}

/**
 * Nullable variant that distinguishes "no reliable timestamp" (`null`) from the real
 * epoch instant (`0L`). Returns `null` when [value] is absent, blank, or unparseable;
 * otherwise the parsed epoch millis. Use this where a caller must treat a missing send
 * time differently from the Unix epoch (e.g. the ephemeral countdown's "just started"
 * fallback), and [isoToEpochMillis] where `0L`-on-absence is the intended sentinel.
 */
public fun isoToEpochMillisOrNull(value: String?): Long? {
    if (value.isNullOrBlank()) return null
    return runCatching { Instant.parse(value).toEpochMilli() }
        .recoverCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }
        .getOrNull()
}

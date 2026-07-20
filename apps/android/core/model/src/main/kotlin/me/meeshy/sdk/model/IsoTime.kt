package me.meeshy.sdk.model

import java.time.Instant
import java.time.OffsetDateTime

/**
 * Canonical best-effort ISO-8601 → epoch-millis conversion; returns null when the
 * value is absent, blank or unparseable, and the parsed epoch (which may legitimately
 * be 0L for the unix epoch) otherwise.
 *
 * Callers that need to distinguish "no reliable timestamp" from "the epoch instant"
 * — e.g. presence resolution, where an absent timestamp must stay online but an
 * ancient one goes away — use this variant; [isoToEpochMillis] collapses both to 0L.
 */
public fun isoToEpochMillisOrNull(value: String?): Long? {
    if (value.isNullOrBlank()) return null
    return runCatching { Instant.parse(value).toEpochMilli() }
        .recoverCatching { OffsetDateTime.parse(value).toInstant().toEpochMilli() }
        .getOrNull()
}

/**
 * Canonical best-effort ISO-8601 → epoch-millis conversion; returns 0L when the
 * value is absent or unparseable.
 *
 * Single source of truth for the gateway's string dates across the SDK: the
 * Room-backed cache sources reach it through the `me.meeshy.sdk.util` re-export,
 * the model layer (story grouping/expiry) calls it directly.
 */
public fun isoToEpochMillis(value: String?): Long = isoToEpochMillisOrNull(value) ?: 0L

package me.meeshy.sdk.util

import me.meeshy.sdk.model.isoToEpochMillis as modelIsoToEpochMillis

/**
 * Best-effort ISO-8601 → epoch-millis conversion; returns 0L when the value is
 * absent or unparseable. Shared by the Room-backed cache sources to derive a
 * sortable timestamp from the gateway's string dates.
 *
 * Delegates to the canonical [me.meeshy.sdk.model.isoToEpochMillis] in
 * `:core:model` so there is one parsing implementation (SSOT).
 */
public fun isoToEpochMillis(value: String?): Long = modelIsoToEpochMillis(value)

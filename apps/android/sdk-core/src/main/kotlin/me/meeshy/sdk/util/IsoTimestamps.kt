package me.meeshy.sdk.util

import me.meeshy.sdk.model.WireDate
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

/**
 * The wire form of an instant the client sends to the gateway (a delta cursor, a grant, a
 * watermark): UTC, three digits of milliseconds, e.g. `2026-09-15T09:34:23.563Z`. Delegates to
 * [WireDate] in `:core:model` — the single place the rounding rule (down, never up) is written.
 */
public fun wireDate(epochMillis: Long): String = WireDate.string(epochMillis)

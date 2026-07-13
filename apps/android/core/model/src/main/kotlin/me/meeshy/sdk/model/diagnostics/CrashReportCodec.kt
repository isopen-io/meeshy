package me.meeshy.sdk.model.diagnostics

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.decodeFromJsonElement

/**
 * Durable JSON codec for the persisted crash list (feature-parity §L).
 *
 * [storageValue] encodes the whole list; [crashReportsFromStorage] decodes it corruption-safely: a
 * blank, absent, or malformed token (or a non-array root) degrades to an empty list, and — mirroring
 * the iOS per-file decode resilience — a single unparseable element is skipped rather than discarding
 * the entire list, so one corrupt entry can never hide every other captured incident.
 */
private val crashReportsJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    explicitNulls = false
}

/** The stable persisted JSON token for the whole crash list. */
public val List<CrashDiagnostic>.storageValue: String
    get() = crashReportsJson.encodeToString(this)

/**
 * Decodes a persisted token back into the crash list. Blank/absent/malformed → empty; a non-array
 * root → empty; individually corrupt array elements are skipped.
 */
public fun crashReportsFromStorage(raw: String?): List<CrashDiagnostic> {
    val trimmed = raw?.trim()
    if (trimmed.isNullOrEmpty()) return emptyList()
    val array = runCatching { crashReportsJson.parseToJsonElement(trimmed) as? JsonArray }.getOrNull()
        ?: return emptyList()
    return array.mapNotNull { element ->
        runCatching { crashReportsJson.decodeFromJsonElement<CrashDiagnostic>(element) }.getOrNull()
    }
}

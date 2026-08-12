package me.meeshy.sdk.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Pure storage codec for the privacy preference block (feature-parity §L).
 *
 * [PrivacyPreferences] is the persisted choice; these helpers are the single source of truth for
 * encoding it to a durable JSON token ([storageValue]) and decoding a stored token back
 * ([privacyPreferencesFromStorage]). Keeping the codec off the store and out of every Composable
 * keeps the corruption-safety branch behavioural-test-covered.
 *
 * `encodeDefaults` persists every field (a toggle left at its default still survives), and the
 * decode is corruption-proof: a blank, absent, or malformed token degrades to the safe defaults;
 * a partial token fills the missing fields with their defaults and ignores unknown keys — so a
 * corrupt or legacy value can never leave the app without a coherent configuration.
 */
private val privacyPrefsJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    explicitNulls = false
    coerceInputValues = true
}

/** The stable persisted JSON token for the whole privacy preference block. */
public val PrivacyPreferences.storageValue: String
    get() = privacyPrefsJson.encodeToString(this)

/**
 * Decodes a persisted token back into the preference block. A blank, absent, or malformed token
 * degrades to [PrivacyPreferences] defaults; a partial token fills the missing fields with their
 * defaults and ignores unknown keys.
 */
public fun privacyPreferencesFromStorage(raw: String?): PrivacyPreferences {
    val trimmed = raw?.trim()
    if (trimmed.isNullOrEmpty()) return PrivacyPreferences()
    return runCatching {
        privacyPrefsJson.decodeFromString<PrivacyPreferences>(trimmed)
    }.getOrDefault(PrivacyPreferences())
}

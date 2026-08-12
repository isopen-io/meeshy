package me.meeshy.sdk.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Pure storage codec for the media-download preference block (feature-parity §L).
 *
 * [MediaDownloadPreferences] is the persisted choice; these helpers are the single source of
 * truth for encoding it to a durable JSON token ([storageValue]) and decoding a stored token
 * back ([mediaDownloadPreferencesFromStorage]). Keeping the codec off the store and out of every
 * Composable keeps the corruption-safety branch behavioural-test-covered.
 *
 * `encodeDefaults` persists every kind (a policy left at its default still survives), and the
 * decode is corruption-proof: a blank, absent, malformed, or unknown-enum token degrades to the
 * safe defaults; a partial token fills the missing kinds with their defaults and ignores unknown
 * keys — so a corrupt or legacy value can never leave the app without a coherent configuration.
 */
private val mediaDownloadPrefsJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    explicitNulls = false
}

/** The stable persisted JSON token for the whole media-download preference block. */
public val MediaDownloadPreferences.storageValue: String
    get() = mediaDownloadPrefsJson.encodeToString(this)

/**
 * Decodes a persisted token back into the preference block. A blank, absent, malformed, or
 * unknown-enum token degrades to [MediaDownloadPreferences] defaults; a partial token fills the
 * missing kinds with their defaults and ignores unknown keys.
 */
public fun mediaDownloadPreferencesFromStorage(raw: String?): MediaDownloadPreferences {
    val trimmed = raw?.trim()
    if (trimmed.isNullOrEmpty()) return MediaDownloadPreferences()
    return runCatching {
        mediaDownloadPrefsJson.decodeFromString<MediaDownloadPreferences>(trimmed)
    }.getOrDefault(MediaDownloadPreferences())
}

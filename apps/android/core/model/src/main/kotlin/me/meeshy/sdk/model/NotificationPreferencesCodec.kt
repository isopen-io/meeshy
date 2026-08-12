package me.meeshy.sdk.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Pure storage codec for the notification-preference block (feature-parity §L).
 *
 * [UserNotificationPreferences] is the persisted choice; these helpers are the single
 * source of truth for encoding it to a durable token ([storageValue]) and decoding a
 * stored/legacy token back ([notificationPreferencesFromStorage]). Keeping the codec off
 * the store and out of every Composable keeps the corruption-safety branch behavioural-
 * test-covered.
 *
 * Unlike the enum-token themes/language codecs, the notification block is a whole record,
 * so it round-trips as JSON. `encodeDefaults` persists every field (a toggled-off field
 * whose value equals a default still survives), and the decode is corruption-proof: a
 * blank, absent, or malformed token degrades to the safe defaults instead of crashing.
 */
private val notificationPrefsJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    explicitNulls = false
}

/** The stable persisted JSON token for the whole notification-preference block. */
public val UserNotificationPreferences.storageValue: String
    get() = notificationPrefsJson.encodeToString(this)

/**
 * Decodes a persisted token back into the preference block. A blank, absent, or malformed
 * token degrades to [UserNotificationPreferences] defaults; a partial token fills the
 * missing fields with their defaults and ignores unknown keys — so a corrupt or legacy
 * value can never leave the app without a coherent notification configuration.
 */
public fun notificationPreferencesFromStorage(raw: String?): UserNotificationPreferences {
    val trimmed = raw?.trim()
    if (trimmed.isNullOrEmpty()) return UserNotificationPreferences()
    return runCatching {
        notificationPrefsJson.decodeFromString<UserNotificationPreferences>(trimmed)
    }.getOrDefault(UserNotificationPreferences())
}

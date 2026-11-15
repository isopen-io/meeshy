package me.meeshy.sdk.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

private fun PreferenceCategory.wireName(): String = name.lowercase()

/**
 * The aggregate after a `PATCH /me/preferences/{category}` that the gateway accepted:
 * [patch] is laid over the cached block, field by field, exactly as the gateway merges it.
 * An undecodable merge leaves the aggregate untouched — the next revalidation corrects it.
 */
fun UserPreferences.withPatch(category: PreferenceCategory, patch: JsonObject, json: Json): UserPreferences {
    val full = Json(from = json) { encodeDefaults = true }
    val aggregate = full.encodeToJsonElement(UserPreferences.serializer(), this) as? JsonObject ?: return this
    val current = aggregate[category.wireName()] as? JsonObject ?: return this
    val merged = JsonObject(current + patch)
    return runCatching {
        full.decodeFromJsonElement(UserPreferences.serializer(), JsonObject(aggregate + (category.wireName() to merged)))
    }.getOrDefault(this)
}

/**
 * The aggregate after `DELETE /me/preferences/{category}`: that block back to the
 * defaults the model declares, every other block untouched. Used when the server's own
 * defaults cannot be re-read right away (offline), so the cache never keeps stale values.
 */
fun UserPreferences.withCategoryReset(category: PreferenceCategory): UserPreferences {
    val defaults = UserPreferences()
    return when (category) {
        PreferenceCategory.PRIVACY -> copy(privacy = defaults.privacy)
        PreferenceCategory.AUDIO -> copy(audio = defaults.audio)
        PreferenceCategory.MESSAGE -> copy(message = defaults.message)
        PreferenceCategory.NOTIFICATION -> copy(notification = defaults.notification)
        PreferenceCategory.VIDEO -> copy(video = defaults.video)
        PreferenceCategory.DOCUMENT -> copy(document = defaults.document)
        PreferenceCategory.APPLICATION -> copy(application = defaults.application)
    }
}

/** The wire segment of [PreferenceCategory] in `me/preferences/{category}` routes. */
val PreferenceCategory.routeSegment: String get() = wireName()

/**
 * Distinct, trimmed, non-empty tags across the user's conversation preferences, sorted
 * case-insensitively — iOS `getMyConversationTags` (no server aggregation endpoint exists).
 */
fun List<ApiConversationPreferences>.distinctSortedTags(): List<String> =
    flatMap { it.tags }
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .distinct()
        .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it })

package me.meeshy.sdk.model

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Le jeton durable des catégories de préférences modifiées localement et pas encore confirmées
 * (iOS `pendingCategories`, clé `meeshy_prefs_pending_categories`) : un tableau JSON de noms de
 * route. Un jeton absent, vide, corrompu, ou un nom inconnu d'une version plus récente se lisent
 * comme « rien en attente » pour cette entrée — jamais comme un plantage au démarrage.
 */
public object PendingPreferenceCategories {
    private val json = Json { ignoreUnknownKeys = true }
    private val names = ListSerializer(String.serializer())

    public fun encode(categories: Set<PreferenceCategory>): String =
        json.encodeToString(names, categories.map { it.routeSegment }.sorted())

    public fun decode(raw: String?): Set<PreferenceCategory> {
        val token = raw?.trim().orEmpty()
        if (token.isEmpty()) return emptySet()
        val decoded = runCatching { json.decodeFromString(names, token) }.getOrNull() ?: return emptySet()
        return decoded.mapNotNull(::categoryNamed).toSet()
    }

    /** La catégorie portant ce nom de route, ou `null` pour un nom que cette version ne connaît pas. */
    public fun categoryNamed(name: String): PreferenceCategory? =
        PreferenceCategory.entries.firstOrNull { it.routeSegment == name }
}

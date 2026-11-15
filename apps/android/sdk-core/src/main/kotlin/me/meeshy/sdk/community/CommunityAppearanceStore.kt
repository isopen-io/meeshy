package me.meeshy.sdk.community

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.theme.DynamicColorGenerator

/** L'apparence LOCALE d'une communauté : sa couleur (hex) et son emoji (vide = aucun). */
data class CommunityAppearance(val color: String, val emoji: String)

/**
 * Couleur et emoji qu'un membre choisit pour une communauté, sur cet appareil seulement — les
 * clés `community.color.<id>` et `community.emoji.<id>` d'iOS (`CommunityDetailScreen`). Sans choix,
 * la couleur dérive du nom (`DynamicColorGenerator.colorForName`) et l'emoji est vide ; écrire une
 * communauté n'en touche jamais une autre.
 */
interface CommunityAppearanceStore {
    fun observe(communityId: String, name: String): Flow<CommunityAppearance>

    suspend fun setColor(communityId: String, hex: String)

    suspend fun setEmoji(communityId: String, emoji: String)

    /** Oublie les choix de toutes les communautés — la frontière de compte (`SessionTeardown`). */
    suspend fun clearAll()
}

internal fun communityColorKey(communityId: String) = "community.color.$communityId"

internal fun communityEmojiKey(communityId: String) = "community.emoji.$communityId"

private fun defaultAppearance(name: String, color: String?, emoji: String?) = CommunityAppearance(
    color = color?.takeIf { it.isNotBlank() } ?: DynamicColorGenerator.colorForName(name),
    emoji = emoji.orEmpty(),
)

/** [CommunityAppearanceStore] volatile — tests et aperçus. */
class InMemoryCommunityAppearanceStore : CommunityAppearanceStore {
    private val values = MutableStateFlow<Map<String, String>>(emptyMap())

    override fun observe(communityId: String, name: String): Flow<CommunityAppearance> =
        values.map { defaultAppearance(name, it[communityColorKey(communityId)], it[communityEmojiKey(communityId)]) }

    override suspend fun setColor(communityId: String, hex: String) = values.update { it + (communityColorKey(communityId) to hex) }

    override suspend fun setEmoji(communityId: String, emoji: String) = values.update { it + (communityEmojiKey(communityId) to emoji) }

    override suspend fun clearAll() = values.update { emptyMap() }
}

/** [CommunityAppearanceStore] durable, adossé à un Preferences [DataStore]. */
class DataStoreCommunityAppearanceStore(
    private val dataStore: DataStore<Preferences>,
) : CommunityAppearanceStore {

    override fun observe(communityId: String, name: String): Flow<CommunityAppearance> =
        dataStore.data.map { prefs ->
            defaultAppearance(
                name = name,
                color = prefs[stringPreferencesKey(communityColorKey(communityId))],
                emoji = prefs[stringPreferencesKey(communityEmojiKey(communityId))],
            )
        }

    override suspend fun setColor(communityId: String, hex: String) {
        dataStore.edit { it[stringPreferencesKey(communityColorKey(communityId))] = hex }
    }

    override suspend fun setEmoji(communityId: String, emoji: String) {
        dataStore.edit { it[stringPreferencesKey(communityEmojiKey(communityId))] = emoji }
    }

    override suspend fun clearAll() {
        dataStore.edit { it.clear() }
    }
}

package me.meeshy.sdk.conversation

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.session.PerAccountCache

/** Le curseur de la suite de la liste et s'il reste des pages : ce qui survit à la mort du processus. */
data class ConversationPaginationSnapshot(val nextCursor: String?, val hasMore: Boolean)

/** Miroir de iOS `CacheCoordinator.conversations.loadCursor / saveCursor` pour la clé « list ». */
interface ConversationPaginationStore {
    suspend fun load(): ConversationPaginationSnapshot?
    suspend fun save(snapshot: ConversationPaginationSnapshot)
    suspend fun clear()
}

class InMemoryConversationPaginationStore(
    private var snapshot: ConversationPaginationSnapshot? = null,
) : ConversationPaginationStore {
    override suspend fun load(): ConversationPaginationSnapshot? = snapshot
    override suspend fun save(snapshot: ConversationPaginationSnapshot) {
        this.snapshot = snapshot
    }
    override suspend fun clear() {
        snapshot = null
    }
}

class DataStoreConversationPaginationStore(
    private val dataStore: DataStore<Preferences>,
) : ConversationPaginationStore {

    override suspend fun load(): ConversationPaginationSnapshot? = dataStore.data.map { prefs ->
        val hasMore = prefs[HAS_MORE] ?: return@map null
        ConversationPaginationSnapshot(prefs[NEXT_CURSOR]?.takeIf { it.isNotEmpty() }, hasMore)
    }.first()

    override suspend fun save(snapshot: ConversationPaginationSnapshot) {
        dataStore.edit { prefs ->
            prefs[HAS_MORE] = snapshot.hasMore
            if (snapshot.nextCursor.isNullOrEmpty()) prefs.remove(NEXT_CURSOR) else prefs[NEXT_CURSOR] = snapshot.nextCursor
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private companion object {
        val NEXT_CURSOR = stringPreferencesKey("conversation_list_next_cursor")
        val HAS_MORE = booleanPreferencesKey("conversation_list_has_more")
    }
}

/** Le curseur appartient au compte : un second compte ne reprend jamais la pagination du premier. */
class ConversationPaginationAccountCache @javax.inject.Inject constructor(
    private val pager: javax.inject.Provider<ConversationPager>,
) : PerAccountCache {
    override suspend fun clear() {
        pager.get().reset()
    }
}

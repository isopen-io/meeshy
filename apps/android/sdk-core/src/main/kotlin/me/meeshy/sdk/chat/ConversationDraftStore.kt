package me.meeshy.sdk.chat

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ConversationDraft

/**
 * Durable per-conversation text-draft store — the Android building block behind
 * iOS `ConversationDraftManager` (`save`/`draft`/`clear`). A stateless seam: it
 * owns bytes only; the "when to save vs purge" product rule lives in
 * `:feature:chat` `DraftAutosave`.
 *
 * Drafts are keyed by conversation id. Reads and writes are suspending because
 * the durable backing (a Preferences [DataStore]) is asynchronous.
 */
public interface ConversationDraftStore {
    /** The stored draft for [conversationId], or `null` if none was persisted. */
    public suspend fun load(conversationId: String): ConversationDraft?

    /** Persists [draft], replacing any existing draft for its conversation. */
    public suspend fun save(draft: ConversationDraft)

    /** Removes the stored draft for [conversationId] (no-op when absent). */
    public suspend fun clear(conversationId: String)

    /**
     * A live view of every persisted draft, keyed by conversation id. Re-emits on
     * each save/clear so a conversation list can float draft-bearing rows to the
     * top reactively. Corrupt/legacy entries are silently omitted.
     */
    public fun observeAll(): Flow<Map<String, ConversationDraft>>
}

/** Volatile [ConversationDraftStore] — for tests and previews. */
public class InMemoryConversationDraftStore(
    initial: Map<String, ConversationDraft> = emptyMap(),
) : ConversationDraftStore {
    private val drafts: MutableStateFlow<Map<String, ConversationDraft>> = MutableStateFlow(initial.toMap())

    override suspend fun load(conversationId: String): ConversationDraft? = drafts.value[conversationId]

    override suspend fun save(draft: ConversationDraft) {
        drafts.update { it + (draft.conversationId to draft) }
    }

    override suspend fun clear(conversationId: String) {
        drafts.update { it - conversationId }
    }

    override fun observeAll(): Flow<Map<String, ConversationDraft>> = drafts.asStateFlow()
}

/**
 * [ConversationDraftStore] backed by a Preferences [DataStore] (the SOTA
 * replacement for `SharedPreferences`). Every draft lives under its own
 * conversation-scoped key, JSON-encoded through [json]. A corrupt/legacy value
 * decodes to `null` (a cache miss) instead of crashing the composer.
 */
public class DataStoreConversationDraftStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : ConversationDraftStore {

    override suspend fun load(conversationId: String): ConversationDraft? =
        dataStore.data.map { prefs -> decode(prefs[keyFor(conversationId)]) }.first()

    override suspend fun save(draft: ConversationDraft) {
        dataStore.edit { prefs ->
            prefs[keyFor(draft.conversationId)] = json.encodeToString(ConversationDraft.serializer(), draft)
        }
    }

    override suspend fun clear(conversationId: String) {
        dataStore.edit { prefs -> prefs.remove(keyFor(conversationId)) }
    }

    override fun observeAll(): Flow<Map<String, ConversationDraft>> =
        dataStore.data.map { prefs ->
            prefs.asMap().entries
                .filter { (key, value) -> key.name.startsWith(KEY_PREFIX) && value is String }
                .mapNotNull { (_, value) -> decode(value as String) }
                .associateBy { it.conversationId }
        }

    private fun keyFor(conversationId: String) = stringPreferencesKey("$KEY_PREFIX$conversationId")

    private fun decode(raw: String?): ConversationDraft? =
        raw?.let { runCatching { json.decodeFromString(ConversationDraft.serializer(), it) }.getOrNull() }

    private companion object {
        private const val KEY_PREFIX = "draft:"
    }
}

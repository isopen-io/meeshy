package me.meeshy.sdk.chat

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
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
}

/** Volatile [ConversationDraftStore] — for tests and previews. */
public class InMemoryConversationDraftStore(
    initial: Map<String, ConversationDraft> = emptyMap(),
) : ConversationDraftStore {
    private val drafts: MutableMap<String, ConversationDraft> = initial.toMutableMap()

    override suspend fun load(conversationId: String): ConversationDraft? = drafts[conversationId]

    override suspend fun save(draft: ConversationDraft) {
        drafts[draft.conversationId] = draft
    }

    override suspend fun clear(conversationId: String) {
        drafts.remove(conversationId)
    }
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

    private fun keyFor(conversationId: String) = stringPreferencesKey("$KEY_PREFIX$conversationId")

    private fun decode(raw: String?): ConversationDraft? =
        raw?.let { runCatching { json.decodeFromString(ConversationDraft.serializer(), it) }.getOrNull() }

    private companion object {
        private const val KEY_PREFIX = "draft:"
    }
}

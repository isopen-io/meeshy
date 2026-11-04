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
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import me.meeshy.core.datastore.BlobCodec
import me.meeshy.sdk.cache.SealedBlobPreferences
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
     * Removes every persisted draft — the account-teardown seam
     * ([me.meeshy.sdk.session.SessionTeardown]): a second account signing in on the
     * same device must never inherit the previous account's unsent draft text.
     */
    public suspend fun clearAll()

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

    override suspend fun clearAll() {
        drafts.update { emptyMap() }
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
    codec: BlobCodec = BlobCodec.Passthrough,
) : ConversationDraftStore {

    private val blobs = SealedBlobPreferences(dataStore, codec) { it.startsWith(KEY_PREFIX) }

    override suspend fun load(conversationId: String): ConversationDraft? {
        blobs.sealLegacy()
        return dataStore.data.map { prefs -> decode(conversationId, prefs[keyFor(conversationId)]) }.first()
    }

    override suspend fun save(draft: ConversationDraft) {
        blobs.sealLegacy()
        val sealed = blobs.seal(json.encodeToString(ConversationDraft.serializer(), draft), keyFor(draft.conversationId).name)
        dataStore.edit { prefs -> prefs[keyFor(draft.conversationId)] = sealed }
    }

    override suspend fun clear(conversationId: String) {
        dataStore.edit { prefs -> prefs.remove(keyFor(conversationId)) }
    }

    override suspend fun clearAll() {
        dataStore.edit { prefs -> prefs.clear() }
    }

    override fun observeAll(): Flow<Map<String, ConversationDraft>> =
        dataStore.data.map { prefs ->
            prefs.asMap().entries
                .filter { (key, value) -> key.name.startsWith(KEY_PREFIX) && value is String }
                .mapNotNull { (key, value) -> decode(key.name.removePrefix(KEY_PREFIX), value as String) }
                .associateBy { it.conversationId }
        }.onStart { blobs.sealLegacy() }

    private fun keyFor(conversationId: String) = stringPreferencesKey("$KEY_PREFIX$conversationId")

    private fun decode(conversationId: String, raw: String?): ConversationDraft? =
        blobs.open(raw, keyFor(conversationId).name)
            ?.let { runCatching { json.decodeFromString(ConversationDraft.serializer(), it) }.getOrNull() }

    private companion object {
        private const val KEY_PREFIX = "draft:"
    }
}

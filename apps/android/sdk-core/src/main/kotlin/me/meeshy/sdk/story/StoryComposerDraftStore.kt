package me.meeshy.sdk.story

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot

/**
 * Durable single-slot store for the in-progress story composer draft — the Android
 * building block behind iOS `StoryDraftStore` (`save`/`load`/`clear`/`isEmpty`). A
 * stateless seam: it owns bytes only; the "when to save vs purge vs restore" product
 * rule lives in `:feature:stories` `StoryComposerAutosave`.
 *
 * Unlike the per-conversation [me.meeshy.sdk.chat.ConversationDraftStore], the composer
 * holds **one** draft at a time, so there is no key — [load]/[save]/[clear] act on the
 * lone slot. Reads and writes are suspending because the durable backing (a Preferences
 * [DataStore]) is asynchronous.
 */
public interface StoryComposerDraftStore {
    /** The stored composer draft, or `null` if none was persisted (or the blob was corrupt). */
    public suspend fun load(): StoryComposerDraftSnapshot?

    /** Persists [snapshot], replacing any previously stored composer draft. */
    public suspend fun save(snapshot: StoryComposerDraftSnapshot)

    /** Removes the stored composer draft (no-op when absent). */
    public suspend fun clear()
}

/** Volatile [StoryComposerDraftStore] — for tests and previews. */
public class InMemoryStoryComposerDraftStore(
    initial: StoryComposerDraftSnapshot? = null,
) : StoryComposerDraftStore {
    private var snapshot: StoryComposerDraftSnapshot? = initial

    override suspend fun load(): StoryComposerDraftSnapshot? = snapshot

    override suspend fun save(snapshot: StoryComposerDraftSnapshot) {
        this.snapshot = snapshot
    }

    override suspend fun clear() {
        snapshot = null
    }
}

/**
 * [StoryComposerDraftStore] backed by a Preferences [DataStore] (the SOTA replacement
 * for `SharedPreferences`). The lone draft lives under a single fixed key, JSON-encoded
 * through [json]. A corrupt/legacy value decodes to `null` (a cache miss) instead of
 * crashing the composer — the same tolerant contract as the chat draft store.
 */
public class DataStoreStoryComposerDraftStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : StoryComposerDraftStore {

    override suspend fun load(): StoryComposerDraftSnapshot? =
        dataStore.data.map { prefs -> decode(prefs[KEY]) }.first()

    override suspend fun save(snapshot: StoryComposerDraftSnapshot) {
        dataStore.edit { prefs ->
            prefs[KEY] = json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot)
        }
    }

    override suspend fun clear() {
        dataStore.edit { prefs -> prefs.remove(KEY) }
    }

    private fun decode(raw: String?): StoryComposerDraftSnapshot? =
        raw?.let { runCatching { json.decodeFromString(StoryComposerDraftSnapshot.serializer(), it) }.getOrNull() }

    private companion object {
        private val KEY = stringPreferencesKey("story_composer_draft")
    }
}

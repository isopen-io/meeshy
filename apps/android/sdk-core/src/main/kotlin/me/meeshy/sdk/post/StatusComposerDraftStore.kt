package me.meeshy.sdk.post

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StatusComposerDraftSnapshot
import me.meeshy.sdk.session.PerAccountCache

/**
 * The mood composer's one durable draft (#13430), per account: cleared at sign-out
 * ([PerAccountCache]) so a second account never opens on the first one's words.
 */
public interface StatusComposerDraftStore : PerAccountCache {
    public suspend fun load(): StatusComposerDraftSnapshot?

    public suspend fun save(snapshot: StatusComposerDraftSnapshot)
}

/** Volatile [StatusComposerDraftStore] — for tests and previews. */
public class InMemoryStatusComposerDraftStore(
    private var snapshot: StatusComposerDraftSnapshot? = null,
) : StatusComposerDraftStore {
    override suspend fun load(): StatusComposerDraftSnapshot? = snapshot

    override suspend fun save(snapshot: StatusComposerDraftSnapshot) {
        this.snapshot = snapshot
    }

    override suspend fun clear() {
        snapshot = null
    }
}

/** [StatusComposerDraftStore] on a Preferences [DataStore]; a corrupt value reads as absent. */
public class DataStoreStatusComposerDraftStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : StatusComposerDraftStore {

    override suspend fun load(): StatusComposerDraftSnapshot? =
        dataStore.data.first()[KEY]?.let {
            runCatching { json.decodeFromString(StatusComposerDraftSnapshot.serializer(), it) }.getOrNull()
        }

    override suspend fun save(snapshot: StatusComposerDraftSnapshot) {
        dataStore.edit { it[KEY] = json.encodeToString(StatusComposerDraftSnapshot.serializer(), snapshot) }
    }

    override suspend fun clear() {
        dataStore.edit { it.remove(KEY) }
    }

    private companion object {
        val KEY = stringPreferencesKey("status_composer_draft")
    }
}

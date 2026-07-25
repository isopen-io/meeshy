package me.meeshy.sdk.session

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AnonymousSessionContext

/**
 * Durable store for the single active anonymous (shared-link guest) session —
 * the Android building block behind iOS's persisted `AnonymousSessionContext`.
 *
 * A device holds at most one guest session at a time, so this is a single-value
 * store, not a keyed one. It is a stateless seam: it owns bytes only. The "when
 * to join / when to leave" product rule lives in the guest-join orchestration
 * (`:feature:*` / `:app`) and in [AnonymousSessionRepository].
 */
public interface AnonymousSessionStore {
    /** The persisted guest session, or `null` when none is stored. */
    public suspend fun load(): AnonymousSessionContext?

    /** Persists [context], replacing any previously stored guest session. */
    public suspend fun save(context: AnonymousSessionContext)

    /** Drops the stored guest session (no-op when absent). */
    public suspend fun clear()
}

/** Volatile [AnonymousSessionStore] — for tests and previews. */
public class InMemoryAnonymousSessionStore(
    initial: AnonymousSessionContext? = null,
) : AnonymousSessionStore {
    private val state: MutableStateFlow<AnonymousSessionContext?> = MutableStateFlow(initial)

    override suspend fun load(): AnonymousSessionContext? = state.value

    override suspend fun save(context: AnonymousSessionContext) {
        state.value = context
    }

    override suspend fun clear() {
        state.value = null
    }
}

/**
 * [AnonymousSessionStore] backed by a Preferences [DataStore] (the SOTA
 * replacement for `SharedPreferences`). The hardened context is JSON-encoded
 * through [json] under a single key. A corrupt/legacy value decodes to `null`
 * (a cache miss) instead of crashing the guest-join flow.
 */
public class DataStoreAnonymousSessionStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : AnonymousSessionStore {

    override suspend fun load(): AnonymousSessionContext? =
        dataStore.data.map { prefs -> decode(prefs[KEY]) }.first()

    override suspend fun save(context: AnonymousSessionContext) {
        dataStore.edit { prefs ->
            prefs[KEY] = json.encodeToString(AnonymousSessionContext.serializer(), context)
        }
    }

    override suspend fun clear() {
        dataStore.edit { prefs -> prefs.remove(KEY) }
    }

    private fun decode(raw: String?): AnonymousSessionContext? =
        raw?.let {
            runCatching { json.decodeFromString(AnonymousSessionContext.serializer(), it) }.getOrNull()
        }

    private companion object {
        private val KEY = stringPreferencesKey("anonymous_session")
    }
}

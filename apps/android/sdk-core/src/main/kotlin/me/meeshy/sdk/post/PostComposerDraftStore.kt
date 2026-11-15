package me.meeshy.sdk.post

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.PostComposerDraftSnapshot
import me.meeshy.sdk.session.PerAccountCache

/**
 * Durable drafts of the feed composer (#13417). Two places, two lifetimes:
 *
 * - the EDITING draft — the composer's autosave, restored when the sheet reopens;
 * - the PARKED drafts — one per publication the device queued, keyed by its outbox `cmid`.
 *   A publish moves the editing draft here instead of erasing it: the words and media the
 *   author wrote stay on the device until the server confirmed the post ([release] from the
 *   `CREATE_POST` delivery) or the author discarded it, and « Rouvrir » brings them back.
 *
 * Cleared with the account at sign-out ([PerAccountCache]).
 */
public interface PostComposerDraftStore : PerAccountCache {
    public suspend fun loadEditing(): PostComposerDraftSnapshot?

    /** The editing draft, live: what « Reprendre votre brouillon » shows at the head of the feed. */
    public fun observeEditing(): Flow<PostComposerDraftSnapshot?>

    public suspend fun saveEditing(snapshot: PostComposerDraftSnapshot)

    public suspend fun clearEditing()

    /** Keeps [snapshot] for the publication [cmid] and empties the editing slot, in one write. */
    public suspend fun park(cmid: String, snapshot: PostComposerDraftSnapshot)

    public suspend fun parked(cmid: String): PostComposerDraftSnapshot?

    public suspend fun parkedCmids(): Set<String>

    /** The publication [cmid] was confirmed or discarded: its parked draft leaves. */
    public suspend fun release(cmid: String)
}

/** Volatile [PostComposerDraftStore] — for tests and previews. */
public class InMemoryPostComposerDraftStore(
    editing: PostComposerDraftSnapshot? = null,
    parked: Map<String, PostComposerDraftSnapshot> = emptyMap(),
) : PostComposerDraftStore {
    private val editingState = MutableStateFlow(editing)
    private var parkedDrafts: Map<String, PostComposerDraftSnapshot> = parked

    override suspend fun loadEditing(): PostComposerDraftSnapshot? = editingState.value

    override fun observeEditing(): Flow<PostComposerDraftSnapshot?> = editingState

    override suspend fun saveEditing(snapshot: PostComposerDraftSnapshot) {
        editingState.value = snapshot
    }

    override suspend fun clearEditing() {
        editingState.value = null
    }

    override suspend fun park(cmid: String, snapshot: PostComposerDraftSnapshot) {
        parkedDrafts = parkedDrafts + (cmid to snapshot)
        editingState.value = null
    }

    override suspend fun parked(cmid: String): PostComposerDraftSnapshot? = parkedDrafts[cmid]

    override suspend fun parkedCmids(): Set<String> = parkedDrafts.keys

    override suspend fun release(cmid: String) {
        parkedDrafts = parkedDrafts - cmid
    }

    override suspend fun clear() {
        editingState.value = null
        parkedDrafts = emptyMap()
    }
}

/**
 * [PostComposerDraftStore] on a Preferences [DataStore]. A corrupt value reads as absent
 * instead of crashing the composer — the contract of the story draft store.
 */
public class DataStorePostComposerDraftStore(
    private val dataStore: DataStore<Preferences>,
    private val json: Json,
) : PostComposerDraftStore {

    override suspend fun loadEditing(): PostComposerDraftSnapshot? =
        decodeDraft(dataStore.data.first()[EDITING])

    override fun observeEditing(): Flow<PostComposerDraftSnapshot?> =
        dataStore.data.map { decodeDraft(it[EDITING]) }.distinctUntilChanged()

    override suspend fun saveEditing(snapshot: PostComposerDraftSnapshot) {
        dataStore.edit { it[EDITING] = json.encodeToString(PostComposerDraftSnapshot.serializer(), snapshot) }
    }

    override suspend fun clearEditing() {
        dataStore.edit { it.remove(EDITING) }
    }

    override suspend fun park(cmid: String, snapshot: PostComposerDraftSnapshot) {
        dataStore.edit { prefs ->
            prefs[PARKED] = encodeParked(decodeParked(prefs[PARKED]) + (cmid to snapshot))
            prefs.remove(EDITING)
        }
    }

    override suspend fun parked(cmid: String): PostComposerDraftSnapshot? =
        decodeParked(dataStore.data.first()[PARKED])[cmid]

    override suspend fun parkedCmids(): Set<String> = decodeParked(dataStore.data.first()[PARKED]).keys

    override suspend fun release(cmid: String) {
        dataStore.edit { prefs ->
            val remaining = decodeParked(prefs[PARKED]) - cmid
            if (remaining.isEmpty()) prefs.remove(PARKED) else prefs[PARKED] = encodeParked(remaining)
        }
    }

    override suspend fun clear() {
        dataStore.edit { prefs ->
            prefs.remove(EDITING)
            prefs.remove(PARKED)
        }
    }

    private fun decodeDraft(raw: String?): PostComposerDraftSnapshot? =
        raw?.let { runCatching { json.decodeFromString(PostComposerDraftSnapshot.serializer(), it) }.getOrNull() }

    private fun decodeParked(raw: String?): Map<String, PostComposerDraftSnapshot> =
        raw?.let { runCatching { json.decodeFromString(PARKED_SERIALIZER, it) }.getOrNull() }.orEmpty()

    private fun encodeParked(parked: Map<String, PostComposerDraftSnapshot>): String =
        json.encodeToString(PARKED_SERIALIZER, parked)

    private companion object {
        val EDITING = stringPreferencesKey("post_composer_draft")
        val PARKED = stringPreferencesKey("post_composer_parked_drafts")
        val PARKED_SERIALIZER = MapSerializer(String.serializer(), PostComposerDraftSnapshot.serializer())
    }
}

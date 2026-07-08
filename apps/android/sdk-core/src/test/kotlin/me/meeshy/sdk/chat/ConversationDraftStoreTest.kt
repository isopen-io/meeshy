package me.meeshy.sdk.chat

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ConversationDraft
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * The per-conversation draft persistence seam (feature-parity §C "Draft
 * auto-save/restore"). [InMemoryConversationDraftStore] is the volatile store used
 * by tests/previews; [DataStoreConversationDraftStore] is the durable one that
 * survives process death. Both are asserted through the public save/load/clear API.
 */
class ConversationDraftStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    private fun newDataStore(scope: CoroutineScope, file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

    private fun draft(id: String, text: String) =
        ConversationDraft(conversationId = id, text = text, updatedAt = "2026-07-07T12:00:00Z")

    // ---- InMemoryConversationDraftStore ----

    @Test
    fun inMemory_load_returns_null_when_no_draft_was_saved() = runBlocking {
        assertThat(InMemoryConversationDraftStore().load("c1")).isNull()
    }

    @Test
    fun inMemory_honours_an_initial_seed() = runBlocking {
        val store = InMemoryConversationDraftStore(mapOf("c1" to draft("c1", "seeded")))

        assertThat(store.load("c1")).isEqualTo(draft("c1", "seeded"))
    }

    @Test
    fun inMemory_save_then_load_round_trips_the_draft() = runBlocking {
        val store = InMemoryConversationDraftStore()

        store.save(draft("c1", "hello"))

        assertThat(store.load("c1")).isEqualTo(draft("c1", "hello"))
    }

    @Test
    fun inMemory_save_replaces_the_previous_draft_for_the_same_conversation() = runBlocking {
        val store = InMemoryConversationDraftStore()

        store.save(draft("c1", "first"))
        store.save(draft("c1", "second"))

        assertThat(store.load("c1")?.text).isEqualTo("second")
    }

    @Test
    fun inMemory_drafts_are_isolated_per_conversation() = runBlocking {
        val store = InMemoryConversationDraftStore()

        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        assertThat(store.load("c1")?.text).isEqualTo("one")
        assertThat(store.load("c2")?.text).isEqualTo("two")
    }

    @Test
    fun inMemory_clear_removes_only_the_targeted_conversation() = runBlocking {
        val store = InMemoryConversationDraftStore()
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        store.clear("c1")

        assertThat(store.load("c1")).isNull()
        assertThat(store.load("c2")?.text).isEqualTo("two")
    }

    @Test
    fun inMemory_clear_of_an_absent_conversation_is_a_no_op() = runBlocking {
        val store = InMemoryConversationDraftStore()

        store.clear("missing")

        assertThat(store.load("missing")).isNull()
    }

    @Test
    fun inMemory_observeAll_reflects_saves_and_clears() = runBlocking {
        val store = InMemoryConversationDraftStore()

        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))
        assertThat(store.observeAll().first().keys).containsExactly("c1", "c2")

        store.clear("c1")
        val after = store.observeAll().first()
        assertThat(after.keys).containsExactly("c2")
        assertThat(after.getValue("c2").text).isEqualTo("two")
    }

    @Test
    fun inMemory_observeAll_starts_from_the_initial_seed() = runBlocking {
        val store = InMemoryConversationDraftStore(mapOf("c1" to draft("c1", "seeded")))

        val all = store.observeAll().first()

        assertThat(all.keys).containsExactly("c1")
        assertThat(all.getValue("c1")).isEqualTo(draft("c1", "seeded"))
    }

    // ---- DataStoreConversationDraftStore (durable) ----

    @Test
    fun dataStore_load_returns_null_when_no_draft_was_saved() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreConversationDraftStore(newDataStore(scope, tmp.newFile("d1.preferences_pb")), json)

        assertThat(store.load("c1")).isNull()

        scope.cancel()
    }

    @Test
    fun dataStore_save_then_load_round_trips_the_draft() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreConversationDraftStore(newDataStore(scope, tmp.newFile("d2.preferences_pb")), json)

        store.save(draft("c1", "unsent thought"))

        assertThat(store.load("c1")).isEqualTo(draft("c1", "unsent thought"))

        scope.cancel()
    }

    @Test
    fun dataStore_a_freshly_constructed_store_reads_the_persisted_draft() = runBlocking {
        // A new wrapper over the already-persisted backing reads the draft rather
        // than caching per-instance — the "survives process death" guarantee.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val backing = newDataStore(scope, tmp.newFile("d3.preferences_pb"))
        DataStoreConversationDraftStore(backing, json).save(draft("c1", "persisted"))

        val reopened = DataStoreConversationDraftStore(backing, json)

        assertThat(reopened.load("c1")?.text).isEqualTo("persisted")

        scope.cancel()
    }

    @Test
    fun dataStore_round_trips_the_reply_reference_alongside_the_text() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreConversationDraftStore(newDataStore(scope, tmp.newFile("d6.preferences_pb")), json)
        val replyDraft = ConversationDraft(
            conversationId = "c1",
            text = "re: salut",
            updatedAt = "2026-07-07T12:00:00Z",
            replyToId = "m1",
        )

        store.save(replyDraft)

        assertThat(store.load("c1")).isEqualTo(replyDraft)

        scope.cancel()
    }

    @Test
    fun dataStore_clear_removes_only_the_targeted_conversation() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreConversationDraftStore(newDataStore(scope, tmp.newFile("d4.preferences_pb")), json)
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        store.clear("c1")

        assertThat(store.load("c1")).isNull()
        assertThat(store.load("c2")?.text).isEqualTo("two")

        scope.cancel()
    }

    @Test
    fun dataStore_decodes_a_corrupt_payload_as_a_cache_miss_instead_of_crashing() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val file = tmp.newFile("d5.preferences_pb")
        val backing = newDataStore(scope, file)
        backing.edit { prefs -> prefs[stringPreferencesKey("draft:c1")] = "{ this is not json" }
        val store = DataStoreConversationDraftStore(backing, json)

        assertThat(store.load("c1")).isNull()

        scope.cancel()
    }

    @Test
    fun dataStore_observeAll_returns_every_persisted_draft_keyed_by_conversation() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = DataStoreConversationDraftStore(newDataStore(scope, tmp.newFile("d7.preferences_pb")), json)
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        val all = store.observeAll().first()

        assertThat(all.keys).containsExactly("c1", "c2")
        assertThat(all.getValue("c1").text).isEqualTo("one")
        assertThat(all.getValue("c2").text).isEqualTo("two")

        scope.cancel()
    }

    @Test
    fun dataStore_observeAll_omits_a_corrupt_entry_instead_of_crashing() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val backing = newDataStore(scope, tmp.newFile("d8.preferences_pb"))
        backing.edit { prefs ->
            prefs[stringPreferencesKey("draft:c1")] = json.encodeToString(
                ConversationDraft.serializer(),
                draft("c1", "valid"),
            )
            prefs[stringPreferencesKey("draft:c2")] = "{ not json"
        }
        val store = DataStoreConversationDraftStore(backing, json)

        val all = store.observeAll().first()

        assertThat(all.keys).containsExactly("c1")

        scope.cancel()
    }
}

package me.meeshy.sdk.chat

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The per-conversation draft persistence seam (feature-parity §C "Draft
 * auto-save/restore"). [InMemoryConversationDraftStore] is the volatile store used
 * by tests/previews; [DataStoreConversationDraftStore] is the durable one that
 * survives process death. Both are asserted through the public save/load/clear API.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler —
 * so none of them depends on a real thread pool getting CPU.
 */
class ConversationDraftStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

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

    @Test
    fun inMemory_clearAll_removesEveryDraft() = runBlocking {
        val store = InMemoryConversationDraftStore()
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        store.clearAll()

        assertThat(store.observeAll().first()).isEmpty()
        assertThat(store.load("c1")).isNull()
        assertThat(store.load("c2")).isNull()
    }

    // ---- DataStoreConversationDraftStore (durable) ----

    @Test
    fun dataStore_load_returns_null_when_no_draft_was_saved() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationDraftStore(dataStores.preferences(tmp.newFile("d1.preferences_pb")), json)

        assertThat(store.load("c1")).isNull()
    }

    @Test
    fun dataStore_save_then_load_round_trips_the_draft() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationDraftStore(dataStores.preferences(tmp.newFile("d2.preferences_pb")), json)

        store.save(draft("c1", "unsent thought"))

        assertThat(store.load("c1")).isEqualTo(draft("c1", "unsent thought"))
    }

    @Test
    fun dataStore_a_freshly_constructed_store_reads_the_persisted_draft() = runTest(dataStores.dispatcher) {
        // A new wrapper over the already-persisted backing reads the draft rather
        // than caching per-instance — the "survives process death" guarantee.
        val backing = dataStores.preferences(tmp.newFile("d3.preferences_pb"))
        DataStoreConversationDraftStore(backing, json).save(draft("c1", "persisted"))

        val reopened = DataStoreConversationDraftStore(backing, json)

        assertThat(reopened.load("c1")?.text).isEqualTo("persisted")
    }

    @Test
    fun dataStore_round_trips_the_reply_reference_alongside_the_text() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationDraftStore(dataStores.preferences(tmp.newFile("d6.preferences_pb")), json)
        val replyDraft = ConversationDraft(
            conversationId = "c1",
            text = "re: salut",
            updatedAt = "2026-07-07T12:00:00Z",
            replyToId = "m1",
        )

        store.save(replyDraft)

        assertThat(store.load("c1")).isEqualTo(replyDraft)
    }

    @Test
    fun dataStore_clear_removes_only_the_targeted_conversation() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationDraftStore(dataStores.preferences(tmp.newFile("d4.preferences_pb")), json)
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        store.clear("c1")

        assertThat(store.load("c1")).isNull()
        assertThat(store.load("c2")?.text).isEqualTo("two")
    }

    @Test
    fun dataStore_clearAll_removesEveryDraft() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationDraftStore(dataStores.preferences(tmp.newFile("d9.preferences_pb")), json)
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        store.clearAll()

        assertThat(store.observeAll().first()).isEmpty()
        assertThat(store.load("c1")).isNull()
        assertThat(store.load("c2")).isNull()
    }

    @Test
    fun dataStore_decodes_a_corrupt_payload_as_a_cache_miss_instead_of_crashing() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("d5.preferences_pb"))
        backing.edit { prefs -> prefs[stringPreferencesKey("draft:c1")] = "{ this is not json" }
        val store = DataStoreConversationDraftStore(backing, json)

        assertThat(store.load("c1")).isNull()
    }

    @Test
    fun dataStore_observeAll_returns_every_persisted_draft_keyed_by_conversation() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationDraftStore(dataStores.preferences(tmp.newFile("d7.preferences_pb")), json)
        store.save(draft("c1", "one"))
        store.save(draft("c2", "two"))

        val all = store.observeAll().first()

        assertThat(all.keys).containsExactly("c1", "c2")
        assertThat(all.getValue("c1").text).isEqualTo("one")
        assertThat(all.getValue("c2").text).isEqualTo("two")
    }

    @Test
    fun dataStore_observeAll_omits_a_corrupt_entry_instead_of_crashing() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("d8.preferences_pb"))
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
    }
}

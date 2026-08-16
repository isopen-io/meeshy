package me.meeshy.sdk.session

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The single-value guest-session persistence seam (feature-parity §A "Anonymous
 * sessions"). [InMemoryAnonymousSessionStore] is the volatile store used by
 * tests/previews; [DataStoreAnonymousSessionStore] is the durable one that
 * survives process death. Both are asserted through the public load/save/clear
 * API — never through internal keys.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler —
 * so none of them depends on a real thread pool getting CPU.
 */
class AnonymousSessionStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun context(
        token: String = "sess-abc",
        participantId: String = "p1",
        conversationId: String = "c1",
        linkId: String = "l1",
        permissions: ParticipantPermissions = ParticipantPermissions.defaultAnonymous,
    ) = AnonymousSessionContext(
        sessionToken = token,
        participantId = participantId,
        permissions = permissions,
        linkId = linkId,
        conversationId = conversationId,
    )

    // ---- InMemoryAnonymousSessionStore ----

    @Test
    fun inMemory_load_returns_null_when_nothing_was_saved() = runBlocking {
        assertThat(InMemoryAnonymousSessionStore().load()).isNull()
    }

    @Test
    fun inMemory_honours_an_initial_seed() = runBlocking {
        val store = InMemoryAnonymousSessionStore(context(token = "seeded"))

        assertThat(store.load()?.sessionToken).isEqualTo("seeded")
    }

    @Test
    fun inMemory_save_then_load_round_trips_the_context() = runBlocking {
        val store = InMemoryAnonymousSessionStore()
        val ctx = context(token = "sess-1", participantId = "px", conversationId = "cx", linkId = "lx")

        store.save(ctx)

        assertThat(store.load()).isEqualTo(ctx)
    }

    @Test
    fun inMemory_save_replaces_the_previous_context() = runBlocking {
        val store = InMemoryAnonymousSessionStore()

        store.save(context(token = "first"))
        store.save(context(token = "second"))

        assertThat(store.load()?.sessionToken).isEqualTo("second")
    }

    @Test
    fun inMemory_clear_removes_the_stored_context() = runBlocking {
        val store = InMemoryAnonymousSessionStore(context(token = "present"))

        store.clear()

        assertThat(store.load()).isNull()
    }

    @Test
    fun inMemory_clear_when_empty_is_a_no_op() = runBlocking {
        val store = InMemoryAnonymousSessionStore()

        store.clear()

        assertThat(store.load()).isNull()
    }

    // ---- DataStoreAnonymousSessionStore (durable) ----

    @Test
    fun dataStore_load_returns_null_when_nothing_was_saved() = runTest(dataStores.dispatcher) {
        val store = DataStoreAnonymousSessionStore(dataStores.preferences(tmp.newFile("a1.preferences_pb")), json)

        assertThat(store.load()).isNull()
    }

    @Test
    fun dataStore_save_then_load_round_trips_the_whole_hardened_context() = runTest(dataStores.dispatcher) {
        val store = DataStoreAnonymousSessionStore(dataStores.preferences(tmp.newFile("a2.preferences_pb")), json)
        val ctx = context(
            token = "sess-durable",
            participantId = "p9",
            conversationId = "c9",
            linkId = "l9",
            permissions = ParticipantPermissions.anonymous(
                canSendMessages = true,
                canSendFiles = true,
                canSendImages = false,
            ),
        )

        store.save(ctx)

        // the full capability set survives the round-trip, not just the token
        assertThat(store.load()).isEqualTo(ctx)
    }

    @Test
    fun dataStore_a_freshly_constructed_store_reads_the_persisted_context() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("a3.preferences_pb"))
        DataStoreAnonymousSessionStore(backing, json).save(context(token = "persisted"))

        val reopened = DataStoreAnonymousSessionStore(backing, json)

        assertThat(reopened.load()?.sessionToken).isEqualTo("persisted")
    }

    @Test
    fun dataStore_clear_removes_the_persisted_context() = runTest(dataStores.dispatcher) {
        val store = DataStoreAnonymousSessionStore(dataStores.preferences(tmp.newFile("a4.preferences_pb")), json)
        store.save(context(token = "to-clear"))

        store.clear()

        assertThat(store.load()).isNull()
    }

    @Test
    fun dataStore_decodes_a_corrupt_payload_as_a_cache_miss_instead_of_crashing() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("a5.preferences_pb"))
        backing.edit { prefs -> prefs[stringPreferencesKey("anonymous_session")] = "{ this is not json" }
        val store = DataStoreAnonymousSessionStore(backing, json)

        assertThat(store.load()).isNull()
    }
}

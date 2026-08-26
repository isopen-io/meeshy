package me.meeshy.sdk.story

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryComposerDraftSnapshot
import me.meeshy.sdk.model.StoryDraftSlideSnapshot
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The single-slot story composer draft persistence seam (feature-parity §E "Draft
 * save/restore"). [InMemoryStoryComposerDraftStore] is the volatile store used by
 * tests/previews; [DataStoreStoryComposerDraftStore] is the durable one that survives
 * process death. Both are asserted through the public save/load/clear API.
 *
 * The durable cases run on [TestDataStores] — an inline, deterministic scheduler — so
 * none of them depends on a real thread pool getting CPU.
 */
class StoryComposerDraftStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun snapshot(text: String) = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", text = text)),
        selectedId = "s1",
        updatedAt = "2026-08-26T12:00:00Z",
    )

    // ---- InMemoryStoryComposerDraftStore ----

    @Test
    fun inMemory_load_returns_null_when_nothing_was_saved() = runBlocking {
        assertThat(InMemoryStoryComposerDraftStore().load()).isNull()
    }

    @Test
    fun inMemory_honours_an_initial_seed() = runBlocking {
        val store = InMemoryStoryComposerDraftStore(snapshot("seeded"))

        assertThat(store.load()).isEqualTo(snapshot("seeded"))
    }

    @Test
    fun inMemory_save_replaces_the_previous_draft() = runBlocking {
        val store = InMemoryStoryComposerDraftStore()

        store.save(snapshot("first"))
        store.save(snapshot("second"))

        assertThat(store.load()?.slides?.single()?.text).isEqualTo("second")
    }

    @Test
    fun inMemory_clear_removes_the_stored_draft() = runBlocking {
        val store = InMemoryStoryComposerDraftStore(snapshot("wip"))

        store.clear()

        assertThat(store.load()).isNull()
    }

    // ---- DataStoreStoryComposerDraftStore ----

    @Test
    fun dataStore_load_returns_null_when_nothing_was_saved() = runTest(dataStores.dispatcher) {
        val store = DataStoreStoryComposerDraftStore(dataStores.preferences(tmp.newFile("s1.preferences_pb")), json)

        assertThat(store.load()).isNull()
    }

    @Test
    fun dataStore_save_then_load_round_trips_the_draft() = runTest(dataStores.dispatcher) {
        val store = DataStoreStoryComposerDraftStore(dataStores.preferences(tmp.newFile("s2.preferences_pb")), json)

        store.save(snapshot("hello"))

        assertThat(store.load()).isEqualTo(snapshot("hello"))
    }

    @Test
    fun dataStore_a_freshly_constructed_store_reads_the_persisted_draft() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("s3.preferences_pb"))
        DataStoreStoryComposerDraftStore(backing, json).save(snapshot("persisted"))

        val reopened = DataStoreStoryComposerDraftStore(backing, json)

        assertThat(reopened.load()?.slides?.single()?.text).isEqualTo("persisted")
    }

    @Test
    fun dataStore_clear_removes_the_stored_draft() = runTest(dataStores.dispatcher) {
        val store = DataStoreStoryComposerDraftStore(dataStores.preferences(tmp.newFile("s4.preferences_pb")), json)
        store.save(snapshot("wip"))

        store.clear()

        assertThat(store.load()).isNull()
    }

    @Test
    fun dataStore_decodes_a_corrupt_payload_as_a_cache_miss_instead_of_crashing() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("s5.preferences_pb"))
        backing.edit { prefs -> prefs[stringPreferencesKey("story_composer_draft")] = "{ this is not json" }
        val store = DataStoreStoryComposerDraftStore(backing, json)

        assertThat(store.load()).isNull()
    }
}

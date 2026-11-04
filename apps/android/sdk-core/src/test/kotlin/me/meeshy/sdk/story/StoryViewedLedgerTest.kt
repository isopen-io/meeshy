package me.meeshy.sdk.story

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StoryViewedEntries
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StoryViewedLedgerTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val now = 10L * StoryViewedEntries.RETENTION_MILLIS

    @Test
    fun `une vue inscrite survit a un registre reconstruit`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("l1.preferences_pb"))
        DataStoreStoryViewedLedger(backing, json) { now }.record("s1", now - 1_000L)

        assertThat(DataStoreStoryViewedLedger(backing, json) { now }.viewed()).containsExactly("s1", now - 1_000L)
    }

    @Test
    fun `inscrire deux fois la meme vue est idempotent et garde la plus recente`() = runTest(dataStores.dispatcher) {
        val ledger = DataStoreStoryViewedLedger(dataStores.preferences(tmp.newFile("l2.preferences_pb")), json) { now }
        ledger.record("s1", now - 2_000L)
        ledger.record("s1", now - 2_000L)
        ledger.record("s1", now - 5_000L)
        assertThat(ledger.viewed()).containsExactly("s1", now - 2_000L)
        ledger.record("s1", now - 1_000L)
        assertThat(ledger.viewed()).containsExactly("s1", now - 1_000L)
    }

    @Test
    fun `une vue plus vieille que la retention est oubliee a l'ecriture suivante`() = runTest(dataStores.dispatcher) {
        val ledger = DataStoreStoryViewedLedger(dataStores.preferences(tmp.newFile("l3.preferences_pb")), json) { now }
        ledger.record("old", now - StoryViewedEntries.RETENTION_MILLIS - 1L)
        ledger.record("fresh", now)
        assertThat(ledger.viewed().keys).containsExactly("fresh")
    }

    @Test
    fun `vider le compte vide le registre`() = runTest(dataStores.dispatcher) {
        val ledger = DataStoreStoryViewedLedger(dataStores.preferences(tmp.newFile("l4.preferences_pb")), json) { now }
        ledger.record("s1", now)
        ledger.clear()
        assertThat(ledger.viewed()).isEmpty()
    }

    @Test
    fun `une valeur illisible vaut un registre vide`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("l5.preferences_pb"))
        backing.edit { it[stringPreferencesKey("story_viewed_ledger")] = "{pas du json" }
        val ledger = DataStoreStoryViewedLedger(backing, json) { now }
        assertThat(ledger.viewed()).isEmpty()
        ledger.record("s1", now)
        assertThat(ledger.viewed()).containsExactly("s1", now)
    }

    @Test
    fun `le registre en memoire suit la meme loi`() = runTest {
        val ledger = InMemoryStoryViewedLedger()
        ledger.record("s1", 5L)
        ledger.record("s1", 3L)
        assertThat(ledger.viewed()).containsExactly("s1", 5L)
        ledger.clear()
        assertThat(ledger.viewed()).isEmpty()
    }
}

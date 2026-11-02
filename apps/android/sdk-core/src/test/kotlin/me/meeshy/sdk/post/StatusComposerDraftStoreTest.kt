package me.meeshy.sdk.post

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.StatusComposerDraftSnapshot
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** #13430 — the mood draft survives the process, belongs to one account and reads back tolerantly. */
class StatusComposerDraftStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private fun mood(text: String = "", emoji: String? = "🔥") =
        StatusComposerDraftSnapshot(emoji = emoji, text = text, visibility = "FRIENDS", updatedAtMillis = 5L)

    @Test
    fun `a draft saved is read back by a freshly built store`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("m1.preferences_pb"))
        DataStoreStatusComposerDraftStore(backing, json).save(mood("on y va"))

        assertThat(DataStoreStatusComposerDraftStore(backing, json).load()).isEqualTo(mood("on y va"))
    }

    @Test
    fun `clearing the account empties the draft`() = runTest(dataStores.dispatcher) {
        val store = DataStoreStatusComposerDraftStore(dataStores.preferences(tmp.newFile("m2.preferences_pb")), json)
        store.save(mood("a"))

        store.clear()

        assertThat(store.load()).isNull()
    }

    @Test
    fun `a corrupt value reads as no draft`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("m3.preferences_pb"))
        backing.edit { it[stringPreferencesKey("status_composer_draft")] = "{not json" }

        assertThat(DataStoreStatusComposerDraftStore(backing, json).load()).isNull()
    }

    @Test
    fun `a blob from an older build decodes with defaults`() {
        val decoded = json.decodeFromString(StatusComposerDraftSnapshot.serializer(), """{"emoji":"🎉"}""")

        assertThat(decoded.visibility).isEqualTo("PUBLIC")
        assertThat(decoded.text).isEmpty()
    }

    @Test
    fun `only a mood or words are worth restoring, and the stamp is no content`() {
        assertThat(StatusComposerDraftSnapshot().isWorthRestoring).isFalse()
        assertThat(StatusComposerDraftSnapshot(text = "  ").isWorthRestoring).isFalse()
        assertThat(StatusComposerDraftSnapshot(emoji = "🎉").isWorthRestoring).isTrue()
        assertThat(mood().sameContentAs(mood().copy(updatedAtMillis = 99L))).isTrue()
        assertThat(mood().sameContentAs(mood("x"))).isFalse()
    }
}

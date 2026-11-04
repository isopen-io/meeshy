package me.meeshy.sdk.chat

import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.datastore.BlobKeySource
import me.meeshy.core.datastore.EncryptedBlobCodec
import me.meeshy.sdk.category.DataStoreCategorySnapshotStore
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ConversationDraftStoreEncryptionTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    private val fixedKey = ByteArray(32) { it.toByte() }
    private fun codec(key: ByteArray? = fixedKey) = EncryptedBlobCodec(object : BlobKeySource {
        override fun existing() = key
        override fun forSealing() = key ?: error("no key")
    })

    private fun draft(id: String, text: String) =
        ConversationDraft(conversationId = id, text = text, updatedAt = "2026-07-07T12:00:00Z")

    private fun rawKey(id: String) = stringPreferencesKey("draft:$id")

    @Test
    fun `a saved draft rests encrypted and is restored identically after a restart`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("e1.preferences_pb"))
        DataStoreConversationDraftStore(backing, json, codec()).save(draft("c1", "texte secret"))

        val stored = backing.data.first()[rawKey("c1")]!!
        val reopened = DataStoreConversationDraftStore(backing, json, codec())

        assertThat(stored).startsWith(EncryptedBlobCodec.PREFIX)
        assertThat(stored).doesNotContain("secret")
        assertThat(reopened.load("c1")).isEqualTo(draft("c1", "texte secret"))
        assertThat(reopened.observeAll().first()).containsExactly("c1", draft("c1", "texte secret"))
    }

    @Test
    fun `a clear text draft written before encryption is read then rewritten encrypted`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("e2.preferences_pb"))
        backing.edit { it[rawKey("c1")] = json.encodeToString(ConversationDraft.serializer(), draft("c1", "ancien")) }

        val loaded = DataStoreConversationDraftStore(backing, json, codec()).load("c1")

        assertThat(loaded).isEqualTo(draft("c1", "ancien"))
        val stored = backing.data.first()[rawKey("c1")]!!
        assertThat(stored).startsWith(EncryptedBlobCodec.PREFIX)
        assertThat(stored).doesNotContain("ancien")
    }

    @Test
    fun `an undecipherable draft is a cache miss, never a crash`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("e3.preferences_pb"))
        DataStoreConversationDraftStore(backing, json, codec()).save(draft("c1", "perdu"))

        val lostKey = DataStoreConversationDraftStore(backing, json, codec(key = null))

        assertThat(lostKey.load("c1")).isNull()
        assertThat(lostKey.observeAll().first()).isEmpty()
    }

    @Test
    fun `saving fails loudly when encryption is impossible and writes nothing in clear`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("e4.preferences_pb"))
        val store = DataStoreConversationDraftStore(backing, json, codec(key = null))

        val failure = runCatching { store.save(draft("c1", "jamais en clair")) }.exceptionOrNull()

        assertThat(failure).isNotNull()
        assertThat(backing.data.first()[rawKey("c1")]).isNull()
    }

    @Test
    fun `the category snapshot rests encrypted and a legacy clear snapshot is migrated`() = runTest(dataStores.dispatcher) {
        val backing = dataStores.preferences(tmp.newFile("e5.preferences_pb"))
        val snapshotKey = stringPreferencesKey("categories_snapshot")
        val syncedKey = androidx.datastore.preferences.core.longPreferencesKey("categories_synced_at")
        val legacy = json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(CategoryOption.serializer()),
            listOf(CategoryOption(id = "w", name = "Travail")),
        )
        backing.edit { it[snapshotKey] = legacy; it[syncedKey] = 5L }

        val store = DataStoreCategorySnapshotStore(backing, json, codec())

        assertThat(store.observe().first()).containsExactly(CategoryOption(id = "w", name = "Travail"))
        assertThat(backing.data.first()[snapshotKey]).startsWith(EncryptedBlobCodec.PREFIX)
    }
}

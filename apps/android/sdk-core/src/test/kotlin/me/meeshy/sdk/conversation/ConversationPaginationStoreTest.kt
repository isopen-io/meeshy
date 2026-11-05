package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.testing.TestDataStores
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ConversationPaginationStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dataStores = TestDataStores()

    @After
    fun tearDown() = dataStores.close()

    @Test
    fun `rien n'est lu avant la première écriture`() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationPaginationStore(dataStores.preferences(tmp.newFile("a.preferences_pb").also { it.delete() }))
        assertThat(store.load()).isNull()
    }

    @Test
    fun `le curseur et hasMore sont relus tels quels après un redémarrage`() = runTest(dataStores.dispatcher) {
        val file = tmp.newFile("b.preferences_pb").also { it.delete() }
        val dataStore = dataStores.preferences(file)
        DataStoreConversationPaginationStore(dataStore).save(ConversationPaginationSnapshot("6512f2a0e1b4c3d2a1908877", true))
        assertThat(DataStoreConversationPaginationStore(dataStore).load())
            .isEqualTo(ConversationPaginationSnapshot("6512f2a0e1b4c3d2a1908877", true))
    }

    @Test
    fun `l'état épuisé sans curseur se persiste aussi`() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationPaginationStore(dataStores.preferences(tmp.newFile("c.preferences_pb").also { it.delete() }))
        store.save(ConversationPaginationSnapshot("x", true))
        store.save(ConversationPaginationSnapshot(null, false))
        assertThat(store.load()).isEqualTo(ConversationPaginationSnapshot(null, false))
    }

    @Test
    fun `clear oublie tout`() = runTest(dataStores.dispatcher) {
        val store = DataStoreConversationPaginationStore(dataStores.preferences(tmp.newFile("d.preferences_pb").also { it.delete() }))
        store.save(ConversationPaginationSnapshot("x", false))
        store.clear()
        assertThat(store.load()).isNull()
    }
}

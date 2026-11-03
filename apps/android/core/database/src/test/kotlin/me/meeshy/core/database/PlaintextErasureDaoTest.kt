package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.PlaintextErasureEntity
import me.meeshy.core.database.entity.PlaintextErasureEntity.Companion.KIND_CONVERSATION
import me.meeshy.core.database.entity.PlaintextErasureEntity.Companion.KIND_MESSAGE
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** #14655 — la file des clairs E2EE à retirer du coffre : par compte, sans doublon, acquittée puis oubliée. */
@RunWith(RobolectricTestRunner::class)
class PlaintextErasureDaoTest {

    private fun withDao(block: suspend (MeeshyDatabase) -> Unit) = runTest {
        val db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        try {
            block(db)
        } finally {
            db.close()
        }
    }

    private fun message(id: String, account: String = "", cid: String? = null, at: Long = 1L) =
        PlaintextErasureEntity(account, KIND_MESSAGE, id, clientMessageId = cid, senderId = "me", recordedAt = at)

    @Test
    fun `un message deja inscrit garde sa premiere inscription, la plus riche`() = withDao { db ->
        val dao = db.plaintextErasureDao()
        dao.recordMessages(listOf(message("m1", cid = "cid_1")))
        dao.recordMessages(listOf(message("m1", cid = null, at = 9L)))

        assertThat(dao.pending("me", 10).single().clientMessageId).isEqualTo("cid_1")
    }

    @Test
    fun `la file sert la session et le compte nomme, jamais un autre compte`() = withDao { db ->
        val dao = db.plaintextErasureDao()
        dao.recordMessages(listOf(message("m1"), message("m2", account = "alice"), message("m3", account = "bob")))

        assertThat(dao.pending("alice", 10).map { it.itemId }).containsExactly("m1", "m2")
    }

    @Test
    fun `un acquittement retire de l attente, la ligne reste connue puis s oublie`() = withDao { db ->
        val dao = db.plaintextErasureDao()
        dao.recordMessages(listOf(message("m1", at = 5L)))

        dao.acknowledge("", KIND_MESSAGE, "m1", recordedAt = 5L, now = 100L)
        assertThat(dao.pending("me", 10)).isEmpty()
        assertThat(dao.recorded("me", KIND_MESSAGE, listOf("m1", "m2")).map { it.itemId }).containsExactly("m1")

        dao.forgetAcknowledgedBefore(101L)
        assertThat(dao.recorded("me", KIND_MESSAGE, listOf("m1"))).isEmpty()
    }

    @Test
    fun `une conversation reinscrite repousse sa borne et revient en attente`() = withDao { db ->
        val dao = db.plaintextErasureDao()
        dao.recordConversation(PlaintextErasureEntity("", KIND_CONVERSATION, "c1", recordedAt = 5L))
        dao.acknowledge("", KIND_CONVERSATION, "c1", recordedAt = 5L, now = 6L)

        dao.recordConversation(PlaintextErasureEntity("", KIND_CONVERSATION, "c1", recordedAt = 50L))

        assertThat(dao.pending("me", 10).single().recordedAt).isEqualTo(50L)
    }

    @Test
    fun `un acquittement sur une inscription remplacee entre-temps ne l acquitte pas`() = withDao { db ->
        val dao = db.plaintextErasureDao()
        dao.recordConversation(PlaintextErasureEntity("", KIND_CONVERSATION, "c1", recordedAt = 50L))

        dao.acknowledge("", KIND_CONVERSATION, "c1", recordedAt = 5L, now = 60L)

        assertThat(dao.pending("me", 10)).hasSize(1)
    }
}

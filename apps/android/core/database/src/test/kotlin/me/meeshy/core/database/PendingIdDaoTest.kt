package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.PendingIdDao
import me.meeshy.core.database.entity.PendingIdEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PendingIdDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: PendingIdDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        dao = db.pendingIdDao()
    }

    @After
    fun tearDown() = db.close()

    private fun pending(local: String, server: String, conversationId: String = "c1") =
        PendingIdEntity(local, server, conversationId, reconciledAt = 5L)

    @Test
    fun `se retrouve par l'identifiant local comme par l'identifiant serveur`() = runTest {
        dao.upsert(pending("cid_1", "srv1"))

        assertThat(dao.byLocalId("cid_1")!!.serverId).isEqualTo("srv1")
        assertThat(dao.byServerId("srv1")!!.localId).isEqualTo("cid_1")
        assertThat(dao.byLocalId("absent")).isNull()
    }

    @Test
    fun `un second ack du meme identifiant local remplace le premier`() = runTest {
        dao.upsert(pending("cid_1", "srv1"))
        dao.upsert(pending("cid_1", "srv2"))

        assertThat(dao.byLocalId("cid_1")!!.serverId).isEqualTo("srv2")
    }

    @Test
    fun `clearConversation ne vide que la conversation visee`() = runTest {
        dao.upsert(pending("cid_1", "srv1", "c1"))
        dao.upsert(pending("cid_2", "srv2", "c2"))

        dao.clearConversation("c1")

        assertThat(dao.byLocalId("cid_1")).isNull()
        assertThat(dao.byLocalId("cid_2")).isNotNull()
    }
}

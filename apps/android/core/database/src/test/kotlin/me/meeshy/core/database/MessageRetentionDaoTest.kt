package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.EditRevisionEntity
import me.meeshy.core.database.entity.EphemeralReceiptEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.PendingIdEntity
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun row(
    id: String,
    conversationId: String = "c1",
    createdAt: Long = 0L,
    sendState: String? = null,
    serverId: String? = null,
    expiresAt: Long? = null,
) = MessageEntity(
    id = id,
    conversationId = conversationId,
    seq = null,
    payload = "{}",
    createdAt = createdAt,
    cachedAt = 0L,
    sendState = sendState,
    serverId = serverId,
    expiresAt = expiresAt,
)

@RunWith(RobolectricTestRunner::class)
class MessageRetentionDaoTest {

    private val db: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()

    @After
    fun tearDown() = db.close()

    @Test
    fun `les cles perimees ignorent les lignes optimistes`() = runTest {
        db.messageDao().upsertAll(
            listOf(row("old", createdAt = 10), row("fresh", createdAt = 900), row("draft", createdAt = 10, sendState = "SENDING")),
        )

        assertThat(db.messageDao().retentionKeysOlderThan(cutoff = 500, limit = 10).map { it.id }).containsExactly("old")
    }

    @Test
    fun `les ephemeres echus sont selectionnes`() = runTest {
        db.messageDao().upsertAll(listOf(row("gone", expiresAt = 100), row("later", expiresAt = 9_000), row("plain")))

        assertThat(db.messageDao().retentionKeysExpired(nowMillis = 500, limit = 10).map { it.id }).containsExactly("gone")
    }

    @Test
    fun `le plafond garde les plus recentes et ne vise que les fils en exces`() = runTest {
        db.messageDao().upsertAll(
            (1..5).map { row("a$it", conversationId = "big", createdAt = it.toLong()) } + row("b1", conversationId = "small"),
        )

        assertThat(db.messageDao().conversationsOverCap(3)).containsExactly("big")
        assertThat(db.messageDao().retentionKeysBeyondNewest("big", keep = 3).map { it.id }).containsExactly("a1", "a2")
    }

    @Test
    fun `la suppression en cascade ne laisse aucun orphelin`() = runTest {
        db.messageDao().upsertAll(listOf(row("cid_1", serverId = "srv1"), row("keep", conversationId = "c2")))
        db.pendingIdDao().upsert(PendingIdEntity("cid_1", "srv1", "c1", reconciledAt = 1))
        db.pendingIdDao().upsert(PendingIdEntity("cid_k", "srvk", "c2", reconciledAt = 1))
        db.editRevisionDao().upsert(EditRevisionEntity("srv1", 1, "v1", 1))
        db.ephemeralReceiptDao().record(EphemeralReceiptEntity("srv1", "c1", 1, null))

        val keys = db.messageDao().retentionKeysForConversation("c1")
        val ids = keys.flatMap { listOfNotNull(it.id, it.serverId) }
        db.pendingIdDao().deleteForMessages(ids)
        db.editRevisionDao().deleteForMessages(ids)
        db.ephemeralReceiptDao().deleteAll(ids)
        db.messageDao().deleteByIds(keys.map { it.id })

        assertThat(db.messageDao().listForConversation("c1")).isEmpty()
        assertThat(db.pendingIdDao().byLocalId("cid_1")).isNull()
        assertThat(db.editRevisionDao().forMessage("srv1")).isEmpty()
        assertThat(db.ephemeralReceiptDao().find("srv1")).isNull()
        assertThat(db.pendingIdDao().byLocalId("cid_k")).isNotNull()
        assertThat(db.messageDao().find("keep")).isNotNull()
    }
}

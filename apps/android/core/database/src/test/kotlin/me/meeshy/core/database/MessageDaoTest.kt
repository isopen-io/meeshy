package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.upsertKeepingLocal
import me.meeshy.core.database.entity.MessageEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private fun messageRow(
    id: String,
    conversationId: String = "c1",
    createdAt: Long = 0L,
) = MessageEntity(
    id = id,
    conversationId = conversationId,
    seq = null,
    payload = "{}",
    createdAt = createdAt,
    cachedAt = 0L,
)

@RunWith(RobolectricTestRunner::class)
class MessageDaoTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var dao: MessageDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        dao = db.messageDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `observeForConversation returns only that conversation, oldest first`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a", "c1", createdAt = 300),
                messageRow("b", "c1", createdAt = 100),
                messageRow("c", "c2", createdAt = 200),
            ),
        )

        val rows = dao.observeForConversation("c1").first()

        assertThat(rows.map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `upsertAll replaces a message by id`() = runTest {
        dao.upsertAll(listOf(messageRow("a", createdAt = 1)))
        dao.upsertAll(listOf(messageRow("a", createdAt = 999)))

        val rows = dao.observeForConversation("c1").first()

        assertThat(rows).hasSize(1)
        assertThat(rows.single().createdAt).isEqualTo(999)
    }

    @Test
    fun `deleteMissing prunes messages absent from the keep set`() = runTest {
        dao.upsertAll(listOf(messageRow("a"), messageRow("b"), messageRow("c")))

        dao.deleteMissing("c1", listOf("b"))

        assertThat(dao.observeForConversation("c1").first().map { it.id }).containsExactly("b")
    }

    @Test
    fun `clearConversation removes only that conversation`() = runTest {
        dao.upsertAll(listOf(messageRow("a", "c1"), messageRow("b", "c2")))

        dao.clearConversation("c1")

        assertThat(dao.observeForConversation("c1").first()).isEmpty()
        assertThat(dao.observeForConversation("c2").first().map { it.id }).containsExactly("b")
    }

    @Test
    fun `recentForConversation returns the newest rows first, scoped to that conversation`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a", "c1", createdAt = 100),
                messageRow("b", "c1", createdAt = 300),
                messageRow("c", "c1", createdAt = 200),
                messageRow("d", "c2", createdAt = 999),
            ),
        )

        val rows = dao.recentForConversation("c1", limit = 5)

        assertThat(rows.map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `recentForConversation respects the limit`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a", "c1", createdAt = 100),
                messageRow("b", "c1", createdAt = 200),
                messageRow("c", "c1", createdAt = 300),
            ),
        )

        val rows = dao.recentForConversation("c1", limit = 2)

        assertThat(rows.map { it.id }).containsExactly("c", "b").inOrder()
    }

    @Test
    fun `recentForConversation on an unknown conversation returns empty`() = runTest {
        dao.upsertAll(listOf(messageRow("a", "c1")))

        val rows = dao.recentForConversation("does-not-exist", limit = 5)

        assertThat(rows).isEmpty()
    }

    @Test
    fun `observeRecentForConversation respects the limit, newest first, scoped to that conversation`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a", "c1", createdAt = 100),
                messageRow("b", "c1", createdAt = 300),
                messageRow("c", "c1", createdAt = 200),
                messageRow("d", "c2", createdAt = 999),
            ),
        )

        val rows = dao.observeRecentForConversation("c1", limit = 2).first()

        assertThat(rows.map { it.id }).containsExactly("b", "c").inOrder()
    }

    @Test
    fun `observeRecentForConversation with a limit covering the whole history returns it all`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a", "c1", createdAt = 100),
                messageRow("b", "c1", createdAt = 300),
                messageRow("c", "c1", createdAt = 200),
            ),
        )

        val rows = dao.observeRecentForConversation("c1", limit = 10).first()

        assertThat(rows.map { it.id }).containsExactly("b", "c", "a").inOrder()
    }

    @Test
    fun `observeRecentForConversation on an unknown conversation returns empty`() = runTest {
        dao.upsertAll(listOf(messageRow("a", "c1")))

        val rows = dao.observeRecentForConversation("does-not-exist", limit = 5).first()

        assertThat(rows).isEmpty()
    }

    @Test
    fun `les nouvelles colonnes survivent a l'aller-retour Room`() = runTest {
        val row = messageRow("a").copy(
            serverId = "srv-a",
            senderId = "u1",
            messageType = "audio",
            deletedAt = 1L,
            expiresAt = 2L,
            pinnedAt = 3L,
            isEncrypted = true,
            encryptionMode = "e2ee",
            encryptedPayload = "AAEC",
            contentText = null,
            deliveredCount = 4,
            readCount = 5,
            recipientCount = 6,
            retryCount = 7,
            lastError = "boom",
            viewOnceOpenedAt = 8L,
            changeVersion = 9L,
            columnsBackfilled = true,
        )
        dao.upsertAll(listOf(row))

        assertThat(dao.find("a")).isEqualTo(row)
    }

    @Test
    fun `une ligne sans les nouvelles colonnes prend leurs valeurs par defaut`() = runTest {
        dao.upsertAll(listOf(messageRow("a")))

        val row = dao.find("a")!!

        assertThat(row.messageType).isEqualTo("text")
        assertThat(row.isEncrypted).isFalse()
        assertThat(row.columnsBackfilled).isFalse()
        assertThat(row.changeVersion).isEqualTo(0L)
    }

    @Test
    fun `findByServerId retrouve une ligne dont la cle primaire est l'identifiant local`() = runTest {
        dao.upsertAll(listOf(messageRow("cid_1").copy(serverId = "srv-1"), messageRow("b")))

        assertThat(dao.findByServerId("srv-1")!!.id).isEqualTo("cid_1")
        assertThat(dao.findByServerId("absent")).isNull()
    }

    @Test
    fun `pinned ne rend que les messages epingles de la conversation, le plus recent d'abord`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("a").copy(pinnedAt = 10L),
                messageRow("b").copy(pinnedAt = 30L),
                messageRow("c"),
                messageRow("d", conversationId = "c2").copy(pinnedAt = 20L),
            ),
        )

        assertThat(dao.pinned("c1").map { it.id }).containsExactly("b", "a").inOrder()
    }

    @Test
    fun `expiredBefore rend les ephemeres dont l'echeance est passee`() = runTest {
        dao.upsertAll(
            listOf(messageRow("old").copy(expiresAt = 100L), messageRow("later").copy(expiresAt = 900L), messageRow("none")),
        )

        assertThat(dao.expiredBefore(nowMillis = 500L).map { it.id }).containsExactly("old")
    }

    @Test
    fun `markViewOnceOpened est permanent et ne se rejoue pas`() = runTest {
        dao.upsertAll(listOf(messageRow("a")))

        dao.markViewOnceOpened("a", openedAt = 50L)
        dao.markViewOnceOpened("a", openedAt = 90L)

        val row = dao.find("a")!!
        assertThat(row.viewOnceOpenedAt).isEqualTo(50L)
        assertThat(row.changeVersion).isEqualTo(1L)
    }

    @Test
    fun `upsertKeepingLocal garde les colonnes locales et fait avancer la version`() = runTest {
        dao.upsertAll(listOf(messageRow("a").copy(retryCount = 2, lastError = "x", viewOnceOpenedAt = 5L, changeVersion = 4L)))

        dao.upsertKeepingLocal(listOf(messageRow("a").copy(payload = "{\"new\":1}", readCount = 3), messageRow("b")))

        val kept = dao.find("a")!!
        assertThat(kept.payload).isEqualTo("{\"new\":1}")
        assertThat(kept.readCount).isEqualTo(3)
        assertThat(kept.retryCount).isEqualTo(2)
        assertThat(kept.lastError).isEqualTo("x")
        assertThat(kept.viewOnceOpenedAt).isEqualTo(5L)
        assertThat(kept.changeVersion).isEqualTo(5L)
        assertThat(dao.find("b")!!.changeVersion).isEqualTo(0L)
    }

    @Test
    fun `unbackfilled rend les lignes a rattraper, les plus anciennes d'abord`() = runTest {
        dao.upsertAll(
            listOf(
                messageRow("new", createdAt = 30L),
                messageRow("old", createdAt = 10L),
                messageRow("done", createdAt = 20L).copy(columnsBackfilled = true),
            ),
        )

        assertThat(dao.unbackfilled(10).map { it.id }).containsExactly("old", "new").inOrder()
        assertThat(dao.countUnbackfilled()).isEqualTo(2)
    }

    @Test
    fun `recordSendAttempt note l'essai sans toucher au reste`() = runTest {
        dao.upsertAll(listOf(messageRow("a").copy(sendState = "SENDING")))

        dao.recordSendAttempt("a", sendState = "FAILED", retryCount = 3, lastError = "timeout")

        val row = dao.find("a")!!
        assertThat(row.sendState).isEqualTo("FAILED")
        assertThat(row.retryCount).isEqualTo(3)
        assertThat(row.lastError).isEqualTo("timeout")
        assertThat(row.payload).isEqualTo("{}")
    }
}

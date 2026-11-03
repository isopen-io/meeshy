package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.EditRevisionEntity
import me.meeshy.core.database.entity.MessageEntity
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.core.database.entity.PendingIdEntity
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

private val NOW = Instant.parse("2026-11-03T12:00:00Z").toEpochMilli()

private fun row(id: String, conversationId: String = "c1", createdAt: Long, sendState: String? = null, serverId: String? = null) =
    MessageEntity(id = id, conversationId = conversationId, seq = null, payload = "{}", createdAt = createdAt, cachedAt = 0L, sendState = sendState, serverId = serverId)

@RunWith(RobolectricTestRunner::class)
class MessageRetentionTest {

    private val db: MeeshyDatabase = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext(),
        MeeshyDatabase::class.java,
    ).allowMainThreadQueries().build()

    private val purger = MessageRetentionPurger(
        db, db.messageDao(), db.pendingIdDao(), db.editRevisionDao(), db.ephemeralReceiptDao(),
        OutboxRepository(db, db.outboxDao()),
    )

    @After
    fun tearDown() = db.close()

    @Test
    fun `le seuil est six mois calendaires avant maintenant`() {
        assertThat(MessageRetention.cutoff(NOW)).isEqualTo(Instant.parse("2026-05-03T12:00:00Z").toEpochMilli())
    }

    @Test
    fun `un message de plus de six mois part avec ses lignes filles, un recent reste`() = runTest {
        val old = Instant.parse("2026-04-01T00:00:00Z").toEpochMilli()
        db.messageDao().upsertAll(listOf(row("srv1", createdAt = old), row("recent", createdAt = NOW - 1_000), row("draft", createdAt = old, sendState = "SENDING")))
        db.pendingIdDao().upsert(PendingIdEntity("cid_1", "srv1", "c1", reconciledAt = 1))
        db.editRevisionDao().upsert(EditRevisionEntity("srv1", 1, "v1", 1))

        val report = purger.run(NOW)

        assertThat(report.aged).isEqualTo(1)
        assertThat(db.messageDao().find("srv1")).isNull()
        assertThat(db.pendingIdDao().byServerId("srv1")).isNull()
        assertThat(db.editRevisionDao().forMessage("srv1")).isEmpty()
        assertThat(db.messageDao().find("recent")).isNotNull()
        assertThat(db.messageDao().find("draft")).isNotNull()
    }

    @Test
    fun `la table est bornee par conversation en gardant les plus recentes`() = runTest {
        val total = MessageRetention.MAX_PER_CONVERSATION + 25
        db.messageDao().upsertAll((1..total).map { row("m$it", createdAt = NOW - 100_000 + it) })

        val report = purger.run(NOW)

        assertThat(report.overCap).isEqualTo(25)
        assertThat(db.messageDao().listForConversation("c1")).hasSize(MessageRetention.MAX_PER_CONVERSATION)
        assertThat(db.messageDao().find("m1")).isNull()
        assertThat(db.messageDao().find("m$total")).isNotNull()
    }

    @Test
    fun `un acces revoque purge la conversation entiere sans toucher les autres`() = runTest {
        db.messageDao().upsertAll(listOf(row("a", createdAt = NOW, serverId = "sa"), row("b", conversationId = "c2", createdAt = NOW)))
        db.pendingIdDao().upsert(PendingIdEntity("cid_a", "sa", "c1", reconciledAt = 1))

        assertThat(purger.purgeConversation("c1")).isEqualTo(1)

        assertThat(db.messageDao().listForConversation("c1")).isEmpty()
        assertThat(db.pendingIdDao().byLocalId("cid_a")).isNull()
        assertThat(db.messageDao().find("b")).isNotNull()
    }

    @Test
    fun `les lignes d'outbox epuisees anciennes sont purgees`() = runTest {
        val weekAgo = NOW - 8L * 24 * 3600 * 1000
        db.outboxDao().upsert(OutboxEntity("x", "reaction", "ADD_REACTION", "t", "{}", null, 5, "EXHAUSTED", weekAgo, weekAgo))
        val report = purger.run(System.currentTimeMillis())

        assertThat(report.outbox).isEqualTo(1)
        assertThat(db.outboxDao().find("x")).isNull()
    }
}

package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.senders.DeleteMessageHandler
import me.meeshy.sdk.outbox.senders.RefusedDeletionReplay
import me.meeshy.sdk.outbox.senders.SyncMetaRefusedDeletionMarks
import me.meeshy.sdk.session.AccountFence
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Audit adversarial du lot #19420 (constat 1) — le rejeu des règlements de A est une BOUCLE. B adopté par-dessus A pendant
 * la première relecture coupe celle-là (le correctif 506d3c32a2), mais la ligne SUIVANTE de la boucle prend son ticket
 * après le changement de compte : celui de B. Elle atterrit, son effacement s'inscrit sous B, et la marque « réglé » est
 * posée : au retour de A, le rejeu ne la relit jamais, et le clair de A reste au coffre de A.
 *
 * Témoin de #19422 : le rejeu est tenu par UN ticket, pris au départ.
 */
@RunWith(RobolectricTestRunner::class)
class RefusedDeletionReplayAccountRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val clock = object : CacheClock { override fun nowMillis(): Long = 1_700_000_000_000L }

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private val erasures by lazy { PlaintextErasureLedger(db, clock) { owner.id } }

    private fun sealedTombstone(id: String) = ApiMessage(
        id = id, conversationId = "c1", senderId = "me", content = "[Encrypted]", createdAt = "2026-06-01T10:00:00Z",
        deletedAt = "2026-06-01T10:05:00Z", isEncrypted = true, encryptionMode = "e2ee",
    )

    private fun exhaustedDeletionOfA(messageId: String, createdAt: Long) = OutboxEntity(
        cmid = "del_$messageId", lane = OutboxLanes.forMessage("c1"), kind = OutboxKind.DELETE_MESSAGE.name, targetId = messageId,
        payload = "", dependsOn = null, attempts = 3, state = OutboxState.EXHAUSTED.name, createdAt = createdAt, updatedAt = createdAt,
        lastError = "Refused: HTTP 404 NOT_FOUND", ownerId = "A",
    )

    private fun repository(api: MessageApi) = MessageRepository(
        api,
        mockk(relaxed = true),
        db,
        db.messageDao(),
        db.syncMetaDao(),
        OutboxRepository(db, db.outboxDao()),
        clock,
        regime = EndToEndRegimeKeeper(EndToEndRegimeLedger.None, db),
        fence = fence,
        erasures = erasures,
    )

    @Test
    fun `the replay of A's settlements lands none of them under B adopted over A while it runs`(): Unit = runBlocking {
        db.messageDao().upsertAll(listOf("m1", "m2").map { MessageEntityFactory.cached(sealedTombstone(it), 1L) })
        db.outboxDao().upsert(exhaustedDeletionOfA("m1", createdAt = 1L))
        db.outboxDao().upsert(exhaustedDeletionOfA("m2", createdAt = 2L))
        val marks = SyncMetaRefusedDeletionMarks(db.syncMetaDao(), clock)
        var reads = 0
        val api = mockk<MessageApi> {
            coEvery { listAround("c1", any(), any()) } coAnswers {
                reads += 1
                if (reads == 1) {
                    owner.id = "B"
                    fence.revoke()
                }
                throw java.io.IOException("B is not a member of c1")
            }
        }
        val handler = DeleteMessageHandler(mockk(relaxed = true), repository(api), settledMarks = marks)

        RefusedDeletionReplay(db.outboxDao(), owner, marks, handler, Dispatchers.Unconfined, fence).replay()

        assertThat(marks.isSettled("del_m1")).isFalse()
        assertThat(marks.isSettled("del_m2")).isFalse()
        assertThat(erasures.pending("B", 10)).isEmpty()
    }
}

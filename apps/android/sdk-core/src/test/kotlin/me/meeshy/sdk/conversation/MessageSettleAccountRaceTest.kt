package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.senders.DeleteMessageHandler
import me.meeshy.sdk.outbox.senders.SyncMetaRefusedDeletionMarks
import me.meeshy.sdk.session.AccountFence
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #19422 (A7) — A's deletion is refused for good, its read-back is in flight, and the account changes before the answer
 * comes. What the settlement decides belongs to A's gesture: it never lifts B's tombstone on the same message id, and
 * never records an erasure under B's account.
 */
@RunWith(RobolectricTestRunner::class)
class MessageSettleAccountRaceTest {

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

    private fun tombstoned(content: String) =
        ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = content, createdAt = "2026-06-01T10:00:00Z", deletedAt = "2026-06-01T10:05:00Z")

    private suspend fun seed(message: ApiMessage) = db.messageDao().upsertAll(listOf(MessageEntityFactory.cached(message, 1L)))

    private suspend fun signOutThenSignInAsB(holdingM1: Boolean = true) {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        if (holdingM1) seed(tombstoned("texte de B"))
    }

    /** Built on first use: [db] exists only once [setUp] has run. */
    private val erasures by lazy { PlaintextErasureLedger(db, clock) { owner.id } }

    private fun repository(api: MessageApi, erasures: PlaintextErasureLedger = this.erasures) = MessageRepository(
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

    private fun apiServingAliveAfterAccountChange() = mockk<MessageApi> {
        coEvery { listAround("c1", "m1", any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = listOf(tombstoned("texte de A").copy(deletedAt = null)))
        }
    }

    @Test
    fun `a read-back answered after B signed in never lifts B's tombstone on the same message id`(): Unit = runBlocking {
        seed(tombstoned("texte de A"))

        repository(apiServingAliveAfterAccountChange()).settleRefusedDeletion("c1", "m1")

        val row = db.messageDao().find("m1")!!
        assertThat(row.deletedAt).isNotNull()
        assertThat(row.payload).contains("texte de B")
    }

    @Test
    fun `a refusal read as gone after B signed in records no erasure under B`(): Unit = runBlocking {
        seed(tombstoned("texte de A"))
        val api = mockk<MessageApi> {
            coEvery { listAround("c1", "m1", any()) } coAnswers {
                signOutThenSignInAsB(holdingM1 = false)
                throw java.io.IOException("offline")
            }
        }

        repository(api).settleRefusedDeletion("c1", "m1", refusedAsGone = true)

        assertThat(erasures.pending("B", 10)).isEmpty()
    }

    /**
     * #19422 — the erasure a settlement records is stamped with the account that ASKED for the read, never with whoever
     * the session names when the write lands: the session's own source may already have moved on while the fence still
     * admits the asking account.
     */
    @Test
    fun `a deletion confirmed by the settlement is recorded under the account that asked for it`(): Unit = runBlocking {
        seed(tombstoned("[Encrypted]").copy(isEncrypted = true, encryptionMode = "e2ee"))
        val sessionAlreadyOnB = PlaintextErasureLedger(db, clock) { "B" }
        val api = mockk<MessageApi> { coEvery { listAround("c1", "m1", any()) } throws java.io.IOException("offline") }

        repository(api, sessionAlreadyOnB).settleRefusedDeletion("c1", "m1", refusedAsGone = true)

        assertThat(sessionAlreadyOnB.pending("A", 10)).isNotEmpty()
        assertThat(sessionAlreadyOnB.pending("B", 10)).isEmpty()
    }

    private fun exhaustedDeletionOfA() = OutboxEntity(
        cmid = "del_m1", lane = OutboxLanes.forMessage("c1"), kind = OutboxKind.DELETE_MESSAGE.name, targetId = "m1",
        payload = "", dependsOn = null, attempts = 3, state = OutboxState.EXHAUSTED.name, createdAt = 1L, updatedAt = 1L,
        lastError = "Refused: HTTP 403 FORBIDDEN", ownerId = "A",
    )

    /**
     * #19422, audit A1 — a settlement the account change cut short decided nothing: it is never marked settled, so the
     * replay of A's next session settles it again ([RefusedDeletionReplay]). Marked, a B adopted over A without a wipe
     * left A's live message « deleted » for good, its row and its queue kept for A's return.
     */
    @Test
    fun `a settlement cut by another account adopted over A is not marked settled, and settles at A's return`(): Unit =
        runBlocking {
            seed(tombstoned("texte de A"))
            val marks = SyncMetaRefusedDeletionMarks(db.syncMetaDao(), clock)
            var reads = 0
            val api = mockk<MessageApi> {
                coEvery { listAround("c1", "m1", any()) } coAnswers {
                    reads += 1
                    if (reads == 1) {
                        owner.id = "B"
                        fence.revoke()
                    }
                    ApiResponse(success = true, data = listOf(tombstoned("texte de A").copy(deletedAt = null)))
                }
            }
            val handler = DeleteMessageHandler(mockk(relaxed = true), repository(api), settledMarks = marks)

            handler.onExhausted(exhaustedDeletionOfA())

            assertThat(marks.isSettled("del_m1")).isFalse()
            assertThat(db.messageDao().find("m1")!!.deletedAt).isNotNull()

            owner.id = "A"
            fence.revoke()
            handler.onExhausted(exhaustedDeletionOfA())

            assertThat(marks.isSettled("del_m1")).isTrue()
            assertThat(db.messageDao().find("m1")!!.deletedAt).isNull()
        }
}

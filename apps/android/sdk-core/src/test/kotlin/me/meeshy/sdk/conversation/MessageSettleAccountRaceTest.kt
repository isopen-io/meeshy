package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.e2ee.PlaintextErasureLedger
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
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

    private val erasures = PlaintextErasureLedger(db, clock) { owner.id }

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
}

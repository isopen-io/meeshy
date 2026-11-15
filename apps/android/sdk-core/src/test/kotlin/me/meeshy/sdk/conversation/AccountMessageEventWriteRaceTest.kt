package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.withAccountTicket
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13560 — the socket event writers of messages and conversations: an event that arrived under account A (its ticket
 * installed when it arrived) never writes into B's rows once A has signed out and B signed in, even when B holds a row
 * with the same id (a conversation both accounts share).
 */
@RunWith(RobolectricTestRunner::class)
class AccountMessageEventWriteRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
    }

    private suspend fun seedMessageOfB() = db.messageDao().upsertAll(
        listOf(MessageEntityFactory.cached(ApiMessage(id = "m1", conversationId = "c1", content = "salut", senderId = "A"), 1L)),
    )

    private suspend fun cachedMessage() =
        MeeshyApi.json.decodeFromString<ApiMessage>(db.messageDao().find("m1")!!.payload)

    @Test
    fun `a socket update of A's message folded after B signed in leaves B's row alone`(): Unit = runBlocking {
        val updater = CachedMessageUpdater(db, db.messageDao(), fence)
        val arrivedUnderA = fence.ticket()
        signOutThenSignInAsB()
        seedMessageOfB()

        withAccountTicket(arrivedUnderA) { updater.update("m1", requireSynced = false) { it.copy(content = "modifié par A") } }

        assertThat(cachedMessage().content).isEqualTo("salut")
    }

    @Test
    fun `a socket update arriving while A is still signed in lands`(): Unit = runBlocking {
        seedMessageOfB()
        val updater = CachedMessageUpdater(db, db.messageDao(), fence)

        updater.update("m1", requireSynced = false) { it.copy(content = "modifié") }

        assertThat(cachedMessage().content).isEqualTo("modifié")
    }

    @Test
    fun `a read receipt that arrived under A upgrades nothing once B signed in`(): Unit = runBlocking {
        val receipts = MessageReceiptWriter(db, db.messageDao(), fence)
        val arrivedUnderA = fence.ticket()
        signOutThenSignInAsB()
        seedMessageOfB()

        withAccountTicket(arrivedUnderA) { receipts.applyReadReceipt("c1", "A", deliveredCount = 1, readCount = 1, frontierIso = null) }

        assertThat(cachedMessage().readCount).isEqualTo(0)
    }

    @Test
    fun `an edit revision recorded under A's ticket after A signed out is not kept for B`(): Unit = runBlocking {
        val ledger = EditRevisionLedger(db.editRevisionDao(), clock, fence)
        val ticket = ledger.ticket()
        signOutThenSignInAsB()

        ledger.record("m1", "ancien texte de A", "nouveau texte de A", ticket)

        assertThat(db.editRevisionDao().forMessage("m1")).isEmpty()
    }

    private suspend fun seedConversationOfB() {
        val conversation = ApiConversation(id = "c1", unreadCount = 3)
        db.conversationDao().upsertAll(
            listOf(
                ConversationEntity(
                    id = "c1",
                    payload = MeeshyApi.json.encodeToString(conversation),
                    updatedAt = 1L,
                    cachedAt = 1L,
                    unreadCount = 3,
                ),
            ),
        )
    }

    private fun repository() = ConversationRepository(
        mockk(relaxed = true), db, db.conversationDao(), db.syncMetaDao(), OutboxRepository(db, db.outboxDao()),
        fence = fence,
    )

    @Test
    fun `a conversation read mark that arrived under A never zeroes B's badge`(): Unit = runBlocking {
        val repository = repository()
        val arrivedUnderA = fence.ticket()
        signOutThenSignInAsB()
        seedConversationOfB()

        withAccountTicket(arrivedUnderA) { repository.markReadLocally("c1") }

        assertThat(db.conversationDao().find("c1")!!.unreadCount).isEqualTo(3)
    }

    @Test
    fun `a remote preferences event that arrived under A never rewrites B's conversation`(): Unit = runBlocking {
        val repository = repository()
        val arrivedUnderA = fence.ticket()
        signOutThenSignInAsB()
        seedConversationOfB()
        val before = db.conversationDao().find("c1")!!.payload

        withAccountTicket(arrivedUnderA) {
            repository.applyRemoteConversationPreferences(
                UserPreferencesConversationUpdatedSocketData(userId = "A", conversationId = "c1", version = 1, reset = true),
            )
        }

        assertThat(db.conversationDao().find("c1")!!.payload).isEqualTo(before)
    }
}

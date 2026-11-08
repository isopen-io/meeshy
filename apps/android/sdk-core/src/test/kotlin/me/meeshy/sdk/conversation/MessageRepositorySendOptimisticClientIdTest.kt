package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.e2ee.EndToEndRegimeLedger
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.SendMessageRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Le partage rejoue le MÊME `clientMessageId` : la bulle et la file ne naissent qu'une fois. */
@RunWith(RobolectricTestRunner::class)
class MessageRepositorySendOptimisticClientIdTest {

    private lateinit var db: MeeshyDatabase
    private lateinit var outbox: OutboxRepository
    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
        outbox = OutboxRepository(db, db.outboxDao())
    }

    @After
    fun tearDown() = db.close()

    private fun repository() = MessageRepository(
        mockk(relaxed = true), mockk(relaxed = true), db, db.messageDao(), db.syncMetaDao(), outbox, SystemCacheClock,
        EndToEndRegimeKeeper(EndToEndRegimeLedger.None, db),
    )

    @Test
    fun `a given client id is the bubble, the wire request and the outbox identity`() = runTest {
        val cid = OutboxIds.derivedCid("share|s1|c1|0")

        val returned = repository().sendOptimistic("c1", "salut", "fr", sender, clientMessageId = cid)

        assertThat(returned).isEqualTo(cid)
        assertThat(db.messageDao().find(cid)).isNotNull()
        val queued = outbox.deliverable(OutboxLanes.forMessage("c1")).single()
        assertThat(queued.cmid).isEqualTo(cid)
        assertThat(MeeshyApi.json.decodeFromString<SendMessageRequest>(queued.payload).clientMessageId).isEqualTo(cid)
    }

    @Test
    fun `replaying the same client id creates neither a second bubble nor a second outbox row`() = runTest {
        val repo = repository()
        val cid = OutboxIds.derivedCid("share|s1|c1|0")

        repo.sendOptimistic("c1", "salut", "fr", sender, clientMessageId = cid)
        val again = repo.sendOptimistic("c1", "salut", "fr", sender, clientMessageId = cid)

        assertThat(again).isEqualTo(cid)
        assertThat(outbox.deliverable(OutboxLanes.forMessage("c1"))).hasSize(1)
    }

    @Test
    fun `a malformed client id is refused instead of silently replaced`() = runTest {
        val outcome = runCatching { repository().sendOptimistic("c1", "salut", "fr", sender, clientMessageId = "not-a-cid") }

        assertThat(outcome.exceptionOrNull()).isInstanceOf(IllegalArgumentException::class.java)
        assertThat(outbox.deliverable(OutboxLanes.forMessage("c1"))).isEmpty()
    }

    @Test
    fun `without a client id every send mints its own`() = runTest {
        val repo = repository()

        val first = repo.sendOptimistic("c1", "a", "fr", sender)
        val second = repo.sendOptimistic("c1", "a", "fr", sender)

        assertThat(first).isNotEqualTo(second)
    }
}

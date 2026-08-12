package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.outbox.FriendRequestPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class FriendRepositoryTest {

    private val api: FriendApi = mockk()
    private lateinit var db: MeeshyDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun outbox() = OutboxRepository(db, db.outboxDao())

    private fun repo(outbox: OutboxRepository = outbox()) = FriendRepository(api, outbox)

    @Test
    fun `a durable send queues a SEND_FRIEND_REQUEST row on the friend lane`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        val cmid = repository.enqueueSendFriendRequest("alice")

        assertThat(cmid).isNotNull()
        val queued = outbox.deliverable(OutboxLanes.FRIEND)
        assertThat(queued).hasSize(1)
        assertThat(queued.single().kindEnum).isEqualTo(OutboxKind.SEND_FRIEND_REQUEST)
        assertThat(queued.single().targetId).isEqualTo("alice")
        assertThat(queued.single().cmid).isEqualTo(cmid)
    }

    @Test
    fun `the queued payload carries the optional greeting`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        repository.enqueueSendFriendRequest("alice", message = "hey there")

        val payload = MeeshyApi.json
            .decodeFromString<FriendRequestPayload>(outbox.deliverable(OutboxLanes.FRIEND).single().payload)
        assertThat(payload.message).isEqualTo("hey there")
    }

    @Test
    fun `a blank receiver id is inert - nothing queued`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        val cmid = repository.enqueueSendFriendRequest("   ")

        assertThat(cmid).isNull()
        assertThat(outbox.deliverable(OutboxLanes.FRIEND)).isEmpty()
    }

    @Test
    fun `a supplied cmid keys the queued row so it matches the optimistic placeholder`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        val cmid = repository.enqueueSendFriendRequest("alice", cmid = "cmid_fixed")

        assertThat(cmid).isEqualTo("cmid_fixed")
        assertThat(outbox.deliverable(OutboxLanes.FRIEND).single().cmid).isEqualTo("cmid_fixed")
    }

    @Test
    fun `a repeated send to the same receiver supersedes the earlier queued row`() = runTest {
        val outbox = outbox()
        val repository = repo(outbox)

        repository.enqueueSendFriendRequest("alice", message = "first")
        val second = repository.enqueueSendFriendRequest("alice", message = "second")

        val queued = outbox.deliverable(OutboxLanes.FRIEND)
        assertThat(queued).hasSize(1)
        assertThat(queued.single().cmid).isEqualTo(second)
        val payload = MeeshyApi.json.decodeFromString<FriendRequestPayload>(queued.single().payload)
        assertThat(payload.message).isEqualTo("second")
    }
}

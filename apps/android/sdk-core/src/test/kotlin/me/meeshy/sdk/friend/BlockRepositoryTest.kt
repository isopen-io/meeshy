package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockApi
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
class BlockRepositoryTest {

    private val api: BlockApi = mockk()
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

    private fun repo(
        cache: BlockCache = BlockCache(),
        outbox: OutboxRepository = outbox(),
    ) = BlockRepository(api, cache, outbox) to cache

    @Test
    fun `listBlocked success hydrates the cache and returns the list`() = runTest {
        coEvery { api.listBlocked() } returns
            ApiResponse(success = true, data = listOf(BlockedUser(id = "u1"), BlockedUser(id = "u2")))
        val (repository, cache) = repo()

        val result = repository.listBlocked()

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat((result as NetworkResult.Success).data.map { it.id }).containsExactly("u1", "u2")
        assertThat(cache.isBlocked("u1")).isTrue()
        assertThat(cache.isBlocked("u2")).isTrue()
    }

    @Test
    fun `listBlocked failure leaves the cache untouched`() = runTest {
        coEvery { api.listBlocked() } returns ApiResponse(success = false, error = "boom")
        val (repository, cache) = repo()

        val result = repository.listBlocked()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(cache.blockedCount).isEqualTo(0)
    }

    @Test
    fun `durable unblock flips the cache off and queues an UNBLOCK_USER row`() = runTest {
        val cache = BlockCache().apply { setBlocked("u1", blocked = true) }
        val outbox = outbox()
        val (repository, _) = repo(cache, outbox)

        val cmid = repository.setBlockedDurably("u1", blocked = false)

        assertThat(cmid).isNotNull()
        assertThat(cache.isBlocked("u1")).isFalse()
        val queued = outbox.deliverable(OutboxLanes.BLOCK)
        assertThat(queued).hasSize(1)
        assertThat(queued.single().kindEnum).isEqualTo(OutboxKind.UNBLOCK_USER)
        assertThat(queued.single().targetId).isEqualTo("u1")
    }

    @Test
    fun `durable block flips the cache on and queues a BLOCK_USER row`() = runTest {
        val outbox = outbox()
        val (repository, cache) = repo(outbox = outbox)

        val cmid = repository.setBlockedDurably("u9", blocked = true)

        assertThat(cmid).isNotNull()
        assertThat(cache.isBlocked("u9")).isTrue()
        val queued = outbox.deliverable(OutboxLanes.BLOCK)
        assertThat(queued.single().kindEnum).isEqualTo(OutboxKind.BLOCK_USER)
        assertThat(queued.single().targetId).isEqualTo("u9")
    }

    @Test
    fun `a blank id is inert - no cache change and nothing queued`() = runTest {
        val outbox = outbox()
        val (repository, cache) = repo(outbox = outbox)

        val cmid = repository.setBlockedDurably("   ", blocked = true)

        assertThat(cmid).isNull()
        assertThat(cache.blockedCount).isEqualTo(0)
        assertThat(outbox.deliverable(OutboxLanes.BLOCK)).isEmpty()
    }

    @Test
    fun `block then unblock of the same user cancels out - empty queue`() = runTest {
        val outbox = outbox()
        val (repository, cache) = repo(outbox = outbox)

        repository.setBlockedDurably("u1", blocked = true)
        val secondCmid = repository.setBlockedDurably("u1", blocked = false)

        // The coalescer annihilated the pending block, so nothing new is queued.
        assertThat(secondCmid).isNull()
        assertThat(outbox.deliverable(OutboxLanes.BLOCK)).isEmpty()
        // The cache reflects the net terminal state: unblocked.
        assertThat(cache.isBlocked("u1")).isFalse()
    }
}

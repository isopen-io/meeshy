package me.meeshy.sdk.friend

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockActionResponse
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.kindEnum
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

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
        coEvery { api.listBlocked(cursor = null, limit = 100) } returns
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
        coEvery { api.listBlocked(cursor = null, limit = 100) } returns
            ApiResponse(success = false, error = "boom")
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

    // --- La lecture canonique, par curseur ---------------------------------

    private fun blocked(prefix: String, count: Int) = List(count) { BlockedUser(id = "$prefix$it") }

    @Test
    fun `listBlocked reads the canonical pages by cursor and hydrates once, with everyone`() = runTest {
        coEvery { api.listBlocked(cursor = null, limit = 100) } returns ApiResponse(
            success = true,
            data = blocked("a", 100),
            pagination = Pagination(hasMore = true, nextCursor = "cur-1", limit = 100),
        )
        coEvery { api.listBlocked(cursor = "cur-1", limit = 100) } returns ApiResponse(
            success = true,
            data = blocked("b", 5),
            pagination = Pagination(hasMore = false, nextCursor = null, limit = 100),
        )
        val (repository, cache) = repo()

        val result = repository.listBlocked()

        assertThat((result as NetworkResult.Success).data).hasSize(105)
        assertThat(cache.blockedCount).isEqualTo(105)
        assertThat(cache.isBlocked("b4")).isTrue()
        coVerify(exactly = 2) { api.listBlocked(any(), any()) }
    }

    @Test
    fun `a page that fails mid-read leaves the cache as it was - nobody is silently unblocked`() = runTest {
        coEvery { api.listBlocked(cursor = null, limit = 100) } returns ApiResponse(
            success = true,
            data = blocked("a", 100),
            pagination = Pagination(hasMore = true, nextCursor = "cur-1", limit = 100),
        )
        coEvery { api.listBlocked(cursor = "cur-1", limit = 100) } throws IOException("offline")
        val cache = BlockCache().apply { setBlocked("kept", blocked = true) }
        val (repository, _) = repo(cache)

        val result = repository.listBlocked()

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(cache.currentBlockedIds).containsExactly("kept")
    }

    @Test
    fun `hydration replaces the cache with the authoritative list`() = runTest {
        coEvery { api.listBlocked(cursor = null, limit = 100) } returns
            ApiResponse(success = true, data = listOf(BlockedUser(id = "u2")))
        val cache = BlockCache().apply { setBlocked("stale", blocked = true) }
        val (repository, _) = repo(cache)

        repository.listBlocked()

        assertThat(cache.currentBlockedIds).containsExactly("u2")
    }

    @Test
    fun `an empty blocklist is a real empty list and clears the cache`() = runTest {
        coEvery { api.listBlocked(cursor = null, limit = 100) } returns
            ApiResponse(success = true, data = emptyList<BlockedUser>())
        val cache = BlockCache().apply { setBlocked("stale", blocked = true) }
        val (repository, _) = repo(cache)

        val result = repository.listBlocked()

        assertThat((result as NetworkResult.Success).data).isEmpty()
        assertThat(cache.blockedCount).isEqualTo(0)
    }

    // --- La livraison d'une ligne de file, idempotente ---------------------

    private fun httpError(status: Int, json: String) =
        HttpException(Response.error<Any>(status, json.toResponseBody("application/json".toMediaType())))

    private val notBlocked =
        """{"success":false,"error":"User is not in your blocked list","message":"User is not in your blocked list"}"""

    private val routeUnknown =
        """{"message":"Route DELETE:/api/v1/directory/blocks/u1 not found","error":"Not Found","statusCode":404}"""

    @Test
    fun `delivering a queued block is a PUT and a replay of it still succeeds`() = runTest {
        coEvery { api.block("u1") } returns
            ApiResponse(success = true, data = BlockActionResponse(message = "User blocked"))
        val (repository, _) = repo()

        val first = repository.deliverBlock("u1")
        val replay = repository.deliverBlock("u1")

        assertThat(first).isEqualTo(NetworkResult.Success(Unit))
        assertThat(replay).isEqualTo(NetworkResult.Success(Unit))
        coVerify(exactly = 2) { api.block("u1") }
    }

    @Test
    fun `delivering a queued unblock is a DELETE`() = runTest {
        coEvery { api.unblock("u1") } returns
            ApiResponse(success = true, data = BlockActionResponse(message = "User unblocked"))
        val (repository, _) = repo()

        val result = repository.deliverUnblock("u1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
        coVerify(exactly = 1) { api.unblock("u1") }
    }

    @Test
    fun `an unblock replayed after the gateway applied it is a success, not a rollback`() = runTest {
        coEvery { api.unblock("u1") } throws httpError(404, notBlocked)
        val (repository, _) = repo()

        val result = repository.deliverUnblock("u1")

        assertThat(result).isEqualTo(NetworkResult.Success(Unit))
    }

    @Test
    fun `a router that does not know the route is still a failed unblock`() = runTest {
        coEvery { api.unblock("u1") } throws httpError(404, routeUnknown)
        val (repository, _) = repo()

        val result = repository.deliverUnblock("u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `an unblock refused for another reason stays a failure the queue will retry`() = runTest {
        coEvery { api.unblock("u1") } throws IOException("offline")
        val (repository, _) = repo()

        val result = repository.deliverUnblock("u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `rows already in the offline queue before the update are still the same two kinds`() = runTest {
        val outbox = outbox()
        val (repository, _) = repo(outbox = outbox)

        repository.setBlockedDurably("u1", blocked = true)
        repository.setBlockedDurably("u2", blocked = false)

        val kinds = outbox.deliverable(OutboxLanes.BLOCK).map { it.kindEnum }
        assertThat(kinds).containsExactly(OutboxKind.BLOCK_USER, OutboxKind.UNBLOCK_USER)
    }
}

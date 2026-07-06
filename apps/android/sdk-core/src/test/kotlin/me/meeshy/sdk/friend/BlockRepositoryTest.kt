package me.meeshy.sdk.friend

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.BlockActionResponse
import me.meeshy.sdk.net.api.BlockApi
import org.junit.Test

class BlockRepositoryTest {

    private val api: BlockApi = mockk()

    private fun repo(cache: BlockCache = BlockCache()) = BlockRepository(api, cache) to cache

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
    fun `unblock success flips the cached entry off`() = runTest {
        coEvery { api.unblock("u1") } returns ApiResponse(success = true, data = Unit)
        val cache = BlockCache().apply { setBlocked("u1", blocked = true) }
        val (repository, _) = repo(cache)

        val result = repository.unblock("u1")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(cache.isBlocked("u1")).isFalse()
    }

    @Test
    fun `unblock failure keeps the user blocked in the cache`() = runTest {
        coEvery { api.unblock("u1") } returns ApiResponse(success = false, error = "boom")
        val cache = BlockCache().apply { setBlocked("u1", blocked = true) }
        val (repository, _) = repo(cache)

        val result = repository.unblock("u1")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(cache.isBlocked("u1")).isTrue()
    }

    @Test
    fun `block success flips the cached entry on`() = runTest {
        coEvery { api.block("u9") } returns
            ApiResponse(success = true, data = BlockActionResponse(message = "ok"))
        val (repository, cache) = repo()

        val result = repository.block("u9")

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(cache.isBlocked("u9")).isTrue()
    }

    @Test
    fun `block failure leaves the cache untouched`() = runTest {
        coEvery { api.block("u9") } returns ApiResponse(success = false, error = "boom")
        val (repository, cache) = repo()

        val result = repository.block("u9")

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(cache.isBlocked("u9")).isFalse()
    }
}

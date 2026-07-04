package me.meeshy.sdk.friend

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import org.junit.Test

class SuggestionsRepositoryTest {

    private val userRepository: UserRepository = mockk()

    private fun user(id: String) = UserSearchResult(id = id, username = id)

    private class FixedClock(private val now: Long) : CacheClock {
        override fun nowMillis(): Long = now
    }

    // ── InMemorySuggestionsSource ────────────────────────────────────────────

    @Test
    fun `revalidate fetches the empty-query list and records the sync time`() = runTest {
        val users = listOf(user("alice"), user("bob"))
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(users)
        val source = InMemorySuggestionsSource(userRepository, FixedClock(1_234L))

        source.revalidate()

        assertThat(source.observe().first()).isEqualTo(users)
        assertThat(source.lastSyncedAt().first()).isEqualTo(1_234L)
    }

    @Test
    fun `a cold revalidation failure throws and leaves the cache empty`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Failure(ApiError("boom"))
        val source = InMemorySuggestionsSource(userRepository, FixedClock(1L))

        val thrown = runCatching { source.revalidate() }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(SuggestionsSyncException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("boom")
        assertThat(source.observe().first()).isNull()
        assertThat(source.lastSyncedAt().first()).isNull()
    }

    @Test
    fun `a failed revalidation keeps the previously cached list`() = runTest {
        val users = listOf(user("alice"))
        coEvery { userRepository.searchUsers("", 20, 0) } returnsMany listOf(
            NetworkResult.Success(users),
            NetworkResult.Failure(ApiError("down")),
        )
        val source = InMemorySuggestionsSource(userRepository, FixedClock(7L))
        source.revalidate()

        runCatching { source.revalidate() }

        assertThat(source.observe().first()).isEqualTo(users)
        assertThat(source.lastSyncedAt().first()).isEqualTo(7L)
    }

    // ── SuggestionsRepository (SWR wiring) ───────────────────────────────────

    @Test
    fun `suggestionsStream emits Empty then paints the fetched suggestions`() = runTest {
        val users = listOf(user("carol"), user("dan"))
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Success(users)
        val repository = SuggestionsRepository(userRepository)

        repository.suggestionsStream().test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            val painted = awaitItem()
            assertThat(painted).isInstanceOf(CacheResult.Fresh::class.java)
            assertThat((painted as CacheResult.Fresh).value).isEqualTo(users)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `suggestionsStream reports a cold failure through onSyncError`() = runTest {
        coEvery { userRepository.searchUsers("", 20, 0) } returns NetworkResult.Failure(ApiError("offline"))
        val repository = SuggestionsRepository(userRepository)
        val errors = mutableListOf<Throwable>()

        repository.suggestionsStream(onSyncError = { errors += it }).test {
            assertThat(awaitItem()).isEqualTo(CacheResult.Empty)
            cancelAndIgnoreRemainingEvents()
        }

        assertThat(errors).hasSize(1)
        assertThat(errors.single()).hasMessageThat().isEqualTo("offline")
    }
}

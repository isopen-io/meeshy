package me.meeshy.sdk.user

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileExpansion
import me.meeshy.sdk.model.PublicProfile
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserApi
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

class UserRepositoryPublicProfileTest {

    private val profile = PublicProfile(
        user = MeeshyUser(id = "u1", username = "bob"),
        stats = UserStats(totalMessages = 4),
    )

    private fun repo(api: UserApi, me: String? = "me-1") = UserRepository(
        userApi = api,
        sessionRepository = mockk<SessionRepository>(relaxed = true).also {
            coEvery { it.currentUserId } returns me
        },
        outboxRepository = mockk<OutboxRepository>(relaxed = true),
    )

    @Test
    fun `a third-party profile reads its stats from the same document`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.getPublicProfile("bob", "stats,presence") } returns
            ApiResponse(success = true, data = profile)

        val result = repo(api).getPublicProfile("bob")

        assertThat((result as NetworkResult.Success).data.stats?.totalMessages).isEqualTo(4)
        coVerify(exactly = 0) { api.getUserStats(any()) }
        coVerify(exactly = 0) { api.getMyStats() }
    }

    @Test
    fun `relation is requested only when asked`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.getPublicProfile("bob", "stats,presence,relation") } returns
            ApiResponse(success = true, data = profile)

        repo(api).getPublicProfile("bob", ProfileExpansion.entries.toSet())

        coVerify { api.getPublicProfile("bob", "stats,presence,relation") }
    }

    @Test
    fun `getProfile projects the public profile onto the user`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.getPublicProfile("bob", "stats,presence") } returns
            ApiResponse(success = true, data = profile)

        val result = repo(api).getProfile("bob")

        assertThat((result as NetworkResult.Success).data.id).isEqualTo("u1")
    }

    @Test
    fun `my own stats go through me-stats, never users-id-stats`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.getMyStats() } returns ApiResponse(success = true, data = UserStats(totalMessages = 9))

        val result = repo(api, me = "me-1").getUserStats("me-1")

        assertThat((result as NetworkResult.Success).data.totalMessages).isEqualTo(9)
        coVerify(exactly = 0) { api.getUserStats(any()) }
    }

    @Test
    fun `another user's stats keep the legacy route for unmigrated callers`() = runTest {
        val api = mockk<UserApi>()
        coEvery { api.getUserStats("u2") } returns ApiResponse(success = true, data = UserStats())

        repo(api, me = "me-1").getUserStats("u2")

        coVerify(exactly = 1) { api.getUserStats("u2") }
        coVerify(exactly = 0) { api.getMyStats() }
    }
}

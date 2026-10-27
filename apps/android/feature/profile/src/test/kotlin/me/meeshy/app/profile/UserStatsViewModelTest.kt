package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class UserStatsViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private val served = UserStats(totalMessages = 1_500, totalConversations = 12)
    private val cached = UserStats(totalMessages = 900)
    private val week = listOf(TimelinePoint("2026-10-01", 4), TimelinePoint("2026-10-02", 9))

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private class Rig(
        val cache: ProfileStatsCacheRepository = mockk(relaxed = true),
        val users: UserRepository = mockk(relaxed = true),
        val online: MutableStateFlow<Boolean> = MutableStateFlow(true),
        accountId: String? = "alice",
    ) {
        val session = mockk<SessionRepository> { every { currentUserId } returns accountId }
        val network = mockk<NetworkMonitor> { every { isOnline } returns online }
        fun viewModel() = UserStatsViewModel(session, users, cache, network)
    }

    @Test
    fun `a cold start with a served answer paints it and keeps it per account`() = runTest(dispatcher) {
        val rig = Rig()
        coEvery { rig.cache.cachedStats("alice") } returns null
        coEvery { rig.cache.cachedTimeline("alice") } returns null
        coEvery { rig.users.getMyStats() } returns NetworkResult.Success(served)
        coEvery { rig.users.getUserStatsTimeline() } returns NetworkResult.Success(week)

        val vm = rig.viewModel()
        assertThat(vm.state.value.isColdLoading).isTrue()
        advanceUntilIdle()

        val state = vm.state.value
        assertThat(state.isColdLoading).isFalse()
        assertThat(state.isRefreshing).isFalse()
        assertThat(state.failure).isNull()
        assertThat(state.stats!!.tiles.first { it.value == 1_500 }.metric).isEqualTo(StatMetric.MESSAGES)
        assertThat(state.timeline!!.bars).hasSize(2)
        coVerify(exactly = 1) { rig.cache.persistStats("alice", served) }
        coVerify(exactly = 1) { rig.cache.persistTimeline("alice", week) }
    }

    @Test
    fun `the cache of the account is painted before the network answers - no skeleton`() = runTest(dispatcher) {
        val rig = Rig()
        coEvery { rig.cache.cachedStats("alice") } returns cached
        coEvery { rig.cache.cachedTimeline("alice") } returns week
        coEvery { rig.users.getMyStats() } coAnswers { NetworkResult.Success(served) }
        coEvery { rig.users.getUserStatsTimeline() } returns NetworkResult.Success(week)

        val vm = rig.viewModel()
        dispatcher.scheduler.runCurrent()

        assertThat(vm.state.value.stats).isNotNull()
        assertThat(vm.state.value.isColdLoading).isFalse()
        advanceUntilIdle()
        assertThat(vm.state.value.stats!!.tiles.first().value).isEqualTo(1_500)
    }

    @Test
    fun `a failed refresh keeps the snapshot and says offline`() = runTest(dispatcher) {
        val rig = Rig(online = MutableStateFlow(false))
        coEvery { rig.cache.cachedStats("alice") } returns cached
        coEvery { rig.cache.cachedTimeline("alice") } returns null
        coEvery { rig.users.getMyStats() } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { rig.users.getUserStatsTimeline() } returns NetworkResult.Failure(ApiError("offline"))

        val vm = rig.viewModel()
        advanceUntilIdle()

        assertThat(vm.state.value.failure).isEqualTo(UserStatsFailure.Offline)
        assertThat(vm.state.value.stats!!.tiles.first().value).isEqualTo(900)
        coVerify(exactly = 0) { rig.cache.persistStats(any(), any()) }
    }

    @Test
    fun `a cold failure online is an error that retry clears`() = runTest(dispatcher) {
        val rig = Rig()
        coEvery { rig.cache.cachedStats(any()) } returns null
        coEvery { rig.cache.cachedTimeline(any()) } returns null
        coEvery { rig.users.getMyStats() } returns NetworkResult.Failure(ApiError("boom"))
        coEvery { rig.users.getUserStatsTimeline() } returns NetworkResult.Failure(ApiError("boom"))
        val vm = rig.viewModel()
        advanceUntilIdle()
        assertThat(vm.state.value.failure).isEqualTo(UserStatsFailure.Error)
        assertThat(vm.state.value.hasContent).isFalse()
        assertThat(vm.state.value.isColdLoading).isFalse()

        coEvery { rig.users.getMyStats() } returns NetworkResult.Success(served)
        coEvery { rig.users.getUserStatsTimeline() } returns NetworkResult.Success(week)
        vm.refresh()
        advanceUntilIdle()

        assertThat(vm.state.value.failure).isNull()
        assertThat(vm.state.value.hasContent).isTrue()
    }

    @Test
    fun `no session is an error and reads nothing`() = runTest(dispatcher) {
        val rig = Rig(accountId = null)

        val vm = rig.viewModel()
        advanceUntilIdle()

        assertThat(vm.state.value.failure).isEqualTo(UserStatsFailure.Error)
        coVerify(exactly = 0) { rig.users.getMyStats() }
    }
}

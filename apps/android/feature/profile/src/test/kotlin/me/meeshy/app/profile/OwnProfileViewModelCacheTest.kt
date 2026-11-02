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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Cache-first behaviour of my page's dashboard: the stats grid and the 30-day
 * timeline must paint from the Room cache before the network answers (or when it
 * never answers), and a successful network fetch must write through so the next
 * cold launch has fresher data. See ARCHITECTURE.md §4 (cache-first, network-second).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class OwnProfileViewModelCacheTest {

    private val dispatcher = StandardTestDispatcher()

    private fun user(id: String = "u1") = MeeshyUser(id = id, username = "alice")

    private fun messagesTileValue(state: OwnProfileUiState): String? =
        state.stats?.tiles?.firstOrNull { it.metric == StatMetric.MESSAGES }?.formattedValue

    private val cachedStats = UserStats(totalMessages = 42)
    private val networkStats = UserStats(totalMessages = 99)

    private val timeline = listOf(
        TimelinePoint(date = "2026-07-01", messages = 4),
        TimelinePoint(date = "2026-07-02", messages = 8),
    )

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun ownProfileVm(
        flow: MutableStateFlow<MeeshyUser?>,
        userRepo: UserRepository,
        statsCache: ProfileStatsCacheRepository,
    ): OwnProfileViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns flow
        return OwnProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = statsCache,
            workManager = mockk(relaxed = true),
            friendshipCache = FriendshipCache(),
            statusBarCache = StatusBarCache(SystemCacheClock),
        )
    }

    // --- stats ---

    @Test
    fun stats_paintFromCache_evenWhenTheNetworkFetchFails() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats("u1") } returns cachedStats
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Failure(ApiError("boom"))

        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, cache)
        advanceUntilIdle()

        assertThat(vm.state.value.stats).isNotNull()
        assertThat(messagesTileValue(vm.state.value)).isEqualTo("42")
        coVerify(exactly = 0) { cache.persistStats(any(), any(), any()) }
    }

    @Test
    fun stats_writeThroughToCache_onASuccessfulNetworkFetch() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats("u1") } returns null
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(networkStats)

        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, cache)
        advanceUntilIdle()

        assertThat(messagesTileValue(vm.state.value)).isEqualTo("99")
        coVerify(exactly = 1) { cache.persistStats("u1", networkStats, any()) }
    }

    @Test
    fun stats_networkResultOverwritesTheCachedPaint_whenBothArePresent() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats("u1") } returns cachedStats
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(networkStats)

        val vm = ownProfileVm(MutableStateFlow(user()), userRepo, cache)
        advanceUntilIdle()

        // network is truth — the fresher value replaces the cached paint
        assertThat(messagesTileValue(vm.state.value)).isEqualTo("99")
        coVerify(exactly = 1) { cache.persistStats("u1", networkStats, any()) }
    }

    private fun ticketRig(flipOnStats: Boolean): Triple<ProfileStatsCacheRepository, UserRepository, AccountTicket> {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        val ticketOfU1 = AccountTicket(ownerId = "u1", generation = 1)
        var signedIn = ticketOfU1
        val signedInAsU2 = AccountTicket(ownerId = "u2", generation = 2)
        coEvery { cache.ticket() } answers { signedIn }
        coEvery { cache.cachedStats(any()) } returns null
        coEvery { cache.cachedTimeline(any()) } returns null
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStats("u1") } coAnswers {
            if (flipOnStats) signedIn = signedInAsU2
            if (flipOnStats) NetworkResult.Success(networkStats) else NetworkResult.Failure(ApiError("off"))
        }
        coEvery { userRepo.getUserStatsTimeline(any()) } coAnswers {
            if (!flipOnStats) signedIn = signedInAsU2
            if (!flipOnStats) NetworkResult.Success(timeline) else NetworkResult.Failure(ApiError("off"))
        }
        return Triple(cache, userRepo, ticketOfU1)
    }

    @Test
    fun stats_areKeptUnderTheTicketTakenBeforeTheirRequestLeft_13560() = runTest(dispatcher) {
        val (cache, userRepo, ticketOfU1) = ticketRig(flipOnStats = true)

        ownProfileVm(MutableStateFlow(user()), userRepo, cache)
        advanceUntilIdle()

        coVerify(exactly = 1) { cache.persistStats("u1", networkStats, ticketOfU1) }
    }

    @Test
    fun timeline_isKeptUnderTheTicketTakenBeforeItsRequestLeft_13560() = runTest(dispatcher) {
        val (cache, userRepo, ticketOfU1) = ticketRig(flipOnStats = false)

        ownProfileVm(MutableStateFlow(user()), userRepo, cache)
        advanceUntilIdle()

        coVerify(exactly = 1) { cache.persistTimeline("u1", timeline, ticketOfU1) }
    }

    // --- timeline ---

    @Test
    fun timeline_paintFromCache_evenWhenTheNetworkFetchFails() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedTimeline(any()) } returns timeline
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Failure(ApiError("boom"))

        val flow = MutableStateFlow<MeeshyUser?>(null)
        val vm = ownProfileVm(flow, userRepo, cache)
        flow.value = user()
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNotNull()
        assertThat(vm.state.value.timeline!!.peak).isEqualTo(8)
        coVerify(exactly = 0) { cache.persistTimeline(any(), any(), any()) }
    }

    @Test
    fun timeline_writeThroughToCache_onASuccessfulNetworkFetch() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedTimeline(any()) } returns null
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Success(timeline)

        val flow = MutableStateFlow<MeeshyUser?>(null)
        val vm = ownProfileVm(flow, userRepo, cache)
        flow.value = user()
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNotNull()
        coVerify(exactly = 1) { cache.persistTimeline("u1", timeline, any()) }
    }

    @Test
    fun timeline_staysNull_whenBothTheEmptyCacheAndTheNetworkYieldNothing() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        // synced-empty cache: builds to null (nothing to chart)
        coEvery { cache.cachedTimeline(any()) } returns emptyList()
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Failure(ApiError("boom"))

        val flow = MutableStateFlow<MeeshyUser?>(null)
        val vm = ownProfileVm(flow, userRepo, cache)
        flow.value = user()
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNull()
        coVerify(exactly = 0) { cache.persistTimeline(any(), any(), any()) }
    }

    @Test
    fun timeline_neverPaintsThePreviousAccountsActivity_underTheNextAccount() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedTimeline("u1") } returns timeline
        coEvery { cache.cachedTimeline("u2") } returns null
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Failure(ApiError("offline"))

        val flow = MutableStateFlow<MeeshyUser?>(user())
        val vm = ownProfileVm(flow, userRepo, cache)
        advanceUntilIdle()
        assertThat(vm.state.value.timeline).isNotNull()

        flow.value = user().copy(id = "u2")
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNull()
        coVerify(exactly = 1) { cache.cachedTimeline("u2") }
    }
}

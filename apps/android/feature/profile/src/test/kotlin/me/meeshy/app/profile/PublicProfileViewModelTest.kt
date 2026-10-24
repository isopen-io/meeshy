package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.Achievement
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The third-party page keeps the former `ProfileViewModel` third-party behaviour:
 * fetch by id or username, cache-first stats, never the me-only timeline.
 * Migrated from the stats, cache, timeline and self suites.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PublicProfileViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private fun user(id: String = "u1") = MeeshyUser(id = id, username = "alice")

    private val sampleStats = UserStats(
        totalMessages = 1_500,
        achievements = listOf(
            Achievement(id = "bavard", threshold = 1_000, current = 1_500, progress = 1.0),
            Achievement(id = "fidele", threshold = 30, current = 12, progress = 0.4),
        ),
    )
    private val cachedStats = UserStats(totalMessages = 42)
    private val networkStats = UserStats(totalMessages = 99)

    private fun coldStatsCache(): ProfileStatsCacheRepository {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats(any()) } returns null
        coEvery { cache.cachedTimeline() } returns null
        return cache
    }

    private fun messagesTileValue(state: PublicProfileUiState): String? =
        state.stats?.tiles?.firstOrNull { it.metric == StatMetric.MESSAGES }?.formattedValue

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun publicProfileViewModel(
        userRepo: UserRepository,
        statsCache: ProfileStatsCacheRepository = coldStatsCache(),
        viewedId: String = "u1",
    ) = PublicProfileViewModel(
        userRepository = userRepo,
        statsCache = statsCache,
        savedStateHandle = SavedStateHandle(mapOf(PublicProfileViewModel.USER_ID_ARG to viewedId)),
    )

    // --- loading ---

    @Test
    fun opening_someoneElse_loadsTheirProfile() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getProfile("u2") } returns NetworkResult.Success(MeeshyUser(id = "u2", username = "bob"))

        val vm = publicProfileViewModel(userRepo, viewedId = "u2")
        advanceUntilIdle()

        assertThat(vm.state.value.user?.id).isEqualTo("u2")
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun aFailedLoad_surfacesTheErrorAndStopsLoading() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Failure(ApiError("introuvable"))

        val vm = publicProfileViewModel(userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.user).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("introuvable")
    }

    @Test
    fun aBlankTarget_fetchesNothing() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)

        val vm = publicProfileViewModel(userRepo, viewedId = "")
        advanceUntilIdle()

        assertThat(vm.state.value.user).isNull()
        coVerify(exactly = 0) { userRepo.getProfile(any()) }
    }

    @Test
    fun otherProfile_neverLoadsTheTimeline_becauseItIsAMeOnlyEndpoint() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getProfile("u9") } returns NetworkResult.Success(user("u9"))

        publicProfileViewModel(userRepo, viewedId = "u9")
        advanceUntilIdle()

        coVerify(exactly = 0) { userRepo.getUserStatsTimeline(any()) }
    }

    // --- stats ---

    @Test
    fun stats_areProjectedIntoState_afterASuccessfulFetch() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(sampleStats)

        val vm = publicProfileViewModel(userRepo)
        advanceUntilIdle()

        val stats = vm.state.value.stats
        assertThat(stats).isNotNull()
        assertThat(stats!!.tiles.first { it.metric == StatMetric.MESSAGES }.formattedValue).isEqualTo("1.5K")
        assertThat(stats.totalCount).isEqualTo(2)
        assertThat(stats.unlockedCount).isEqualTo(1)
    }

    @Test
    fun stats_stayNull_whenTheStatsFetchFails_withoutClobberingTheProfile() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Failure(ApiError("boom"))

        val vm = publicProfileViewModel(userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.stats).isNull()
        assertThat(vm.state.value.user).isNotNull()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun stats_areNotClobbered_whenTheStatsFetchThrows() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } throws RuntimeException("network down")

        val vm = publicProfileViewModel(userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.stats).isNull()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    // --- stats cache ---

    @Test
    fun stats_paintFromCache_evenWhenTheNetworkFetchFails() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats("u1") } returns cachedStats
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Failure(ApiError("boom"))

        val vm = publicProfileViewModel(userRepo, cache)
        advanceUntilIdle()

        assertThat(messagesTileValue(vm.state.value)).isEqualTo("42")
        coVerify(exactly = 0) { cache.persistStats(any(), any()) }
    }

    @Test
    fun stats_writeThroughToCache_onASuccessfulNetworkFetch() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats("u1") } returns null
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(networkStats)

        val vm = publicProfileViewModel(userRepo, cache)
        advanceUntilIdle()

        assertThat(messagesTileValue(vm.state.value)).isEqualTo("99")
        coVerify(exactly = 1) { cache.persistStats("u1", networkStats) }
    }

    @Test
    fun stats_networkResultOverwritesTheCachedPaint_whenBothArePresent() = runTest(dispatcher) {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats("u1") } returns cachedStats
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(networkStats)

        val vm = publicProfileViewModel(userRepo, cache)
        advanceUntilIdle()

        assertThat(messagesTileValue(vm.state.value)).isEqualTo("99")
        coVerify(exactly = 1) { cache.persistStats("u1", networkStats) }
    }
}

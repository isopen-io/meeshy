package me.meeshy.app.profile

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.model.Achievement
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserStats
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelStatsTest {

    private val dispatcher = StandardTestDispatcher()

    private fun user(id: String = "u1") = MeeshyUser(id = id, username = "alice")

    private val sampleStats = UserStats(
        totalMessages = 1_500,
        achievements = listOf(
            Achievement(id = "bavard", threshold = 1_000, current = 1_500, progress = 1.0),
            Achievement(id = "fidele", threshold = 30, current = 12, progress = 0.4),
        ),
    )

    private fun coldStatsCache(): ProfileStatsCacheRepository {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats(any()) } returns null
        coEvery { cache.cachedTimeline() } returns null
        return cache
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun otherProfileViewModel(
        session: SessionRepository = mockk(relaxed = true),
        userRepo: UserRepository,
        statsCache: ProfileStatsCacheRepository = coldStatsCache(),
        viewedId: String = "u1",
    ) = ProfileViewModel(
        sessionRepository = session,
        userRepository = userRepo,
        statsCache = statsCache,
        savedStateHandle = SavedStateHandle(mapOf(ProfileViewModel.USER_ID_ARG to viewedId)),
    )

    @Test
    fun stats_areProjectedIntoState_afterASuccessfulFetch() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getProfile("u1") } returns NetworkResult.Success(user())
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(sampleStats)

        val vm = otherProfileViewModel(userRepo = userRepo)
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

        val vm = otherProfileViewModel(userRepo = userRepo)
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

        val vm = otherProfileViewModel(userRepo = userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.stats).isNull()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun ownProfile_loadsStatsExactlyOnce_acrossRepeatedSessionEmissions() = runTest(dispatcher) {
        val session = mockk<SessionRepository>()
        val flow = MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUser } returns flow

        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getUserStats("u1") } returns NetworkResult.Success(sampleStats)

        val vm = ProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = coldStatsCache(),
            savedStateHandle = SavedStateHandle(),
        )

        flow.value = user()
        advanceUntilIdle()
        // A fresh user object with the SAME id — the StateFlow re-emits but the id is unchanged.
        flow.value = user().copy(displayName = "Alice Renamed")
        advanceUntilIdle()

        assertThat(vm.state.value.stats).isNotNull()
        coVerify(exactly = 1) { userRepo.getUserStats("u1") }
    }

    @Test
    fun ownProfile_neverLoadsStats_whileTheSessionUserIsAbsent() = runTest(dispatcher) {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        val userRepo = mockk<UserRepository>(relaxed = true)

        val vm = ProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = coldStatsCache(),
            savedStateHandle = SavedStateHandle(),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.stats).isNull()
        coVerify(exactly = 0) { userRepo.getUserStats(any()) }
    }
}

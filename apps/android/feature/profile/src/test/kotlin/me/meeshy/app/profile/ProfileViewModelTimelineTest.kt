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
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TimelinePoint
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelTimelineTest {

    private val dispatcher = StandardTestDispatcher()

    private fun user(id: String = "u1") = MeeshyUser(id = id, username = "alice")

    private val sampleTimeline = listOf(
        TimelinePoint(date = "2026-07-01", messages = 4),
        TimelinePoint(date = "2026-07-02", messages = 8),
        TimelinePoint(date = "2026-07-03", messages = 0),
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

    private fun ownProfileViewModel(
        session: SessionRepository,
        userRepo: UserRepository,
        statsCache: ProfileStatsCacheRepository = coldStatsCache(),
    ) =
        ProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = statsCache,
            savedStateHandle = SavedStateHandle(),
        )

    private fun sessionWith(flow: MutableStateFlow<MeeshyUser?>): SessionRepository {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns flow
        return session
    }

    @Test
    fun ownProfile_projectsTheTimelineIntoState_afterASuccessfulFetch() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(null)
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Success(sampleTimeline)

        val vm = ownProfileViewModel(sessionWith(flow), userRepo)
        flow.value = user()
        advanceUntilIdle()

        val timeline = vm.state.value.timeline
        assertThat(timeline).isNotNull()
        assertThat(timeline!!.peak).isEqualTo(8)
        assertThat(timeline.total).isEqualTo(12)
        assertThat(timeline.bars.map { it.date })
            .containsExactly("2026-07-01", "2026-07-02", "2026-07-03").inOrder()
    }

    @Test
    fun ownProfile_timelineStaysNull_whenTheFetchFails_withoutClobberingTheProfile() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(null)
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Failure(ApiError("boom"))

        val vm = ownProfileViewModel(sessionWith(flow), userRepo)
        flow.value = user()
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNull()
        assertThat(vm.state.value.user).isNotNull()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun ownProfile_timelineStaysNull_whenTheFetchThrows() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(null)
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } throws RuntimeException("network down")

        val vm = ownProfileViewModel(sessionWith(flow), userRepo)
        flow.value = user()
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNull()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun ownProfile_loadsTheTimelineExactlyOnce_acrossRepeatedSessionEmissions() = runTest(dispatcher) {
        val flow = MutableStateFlow<MeeshyUser?>(null)
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Success(sampleTimeline)

        val vm = ownProfileViewModel(sessionWith(flow), userRepo)
        flow.value = user()
        advanceUntilIdle()
        flow.value = user().copy(displayName = "Alice Renamed")
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNotNull()
        coVerify(exactly = 1) { userRepo.getUserStatsTimeline(any()) }
    }

    @Test
    fun ownProfile_neverLoadsTheTimeline_whileTheSessionUserIsAbsent() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)

        val vm = ownProfileViewModel(sessionWith(MutableStateFlow(null)), userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNull()
        coVerify(exactly = 0) { userRepo.getUserStatsTimeline(any()) }
    }

    @Test
    fun otherProfile_neverLoadsTheTimeline_becauseItIsAMeOnlyEndpoint() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getProfile("u9") } returns NetworkResult.Success(user("u9"))

        val vm = ProfileViewModel(
            sessionRepository = mockk(relaxed = true),
            userRepository = userRepo,
            statsCache = coldStatsCache(),
            savedStateHandle = SavedStateHandle(mapOf(ProfileViewModel.USER_ID_ARG to "u9")),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.timeline).isNull()
        coVerify(exactly = 0) { userRepo.getUserStatsTimeline(any()) }
    }
}

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
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileViewModelSelfTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun me() = MeeshyUser(id = "me1", username = "atabeth", displayName = "Moi")

    private fun coldStatsCache(): ProfileStatsCacheRepository {
        val cache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { cache.cachedStats(any()) } returns null
        coEvery { cache.cachedTimeline() } returns null
        return cache
    }

    private fun viewModel(viewed: String, userRepo: UserRepository): ProfileViewModel {
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(me())
        every { session.currentUserId } returns "me1"
        return ProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = coldStatsCache(),
            workManager = mockk(relaxed = true),
            savedStateHandle = SavedStateHandle(mapOf(ProfileViewModel.USER_ID_ARG to viewed)),
        )
    }

    @Test
    fun opening_myOwnId_isMyOwnProfile_editableFromTheSession() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)

        val vm = viewModel(viewed = "me1", userRepo = userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.isOwnProfile).isTrue()
        assertThat(vm.state.value.user?.id).isEqualTo("me1")
        assertThat(vm.state.value.displayName).isEqualTo("Moi")
        coVerify(exactly = 0) { userRepo.getProfile(any()) }
        coVerify(exactly = 1) { userRepo.getUserStatsTimeline(any()) }
    }

    @Test
    fun opening_myOwnUsername_isMyOwnProfile() = runTest(dispatcher) {
        val vm = viewModel(viewed = "atabeth", userRepo = mockk(relaxed = true))
        advanceUntilIdle()

        assertThat(vm.state.value.isOwnProfile).isTrue()
    }

    @Test
    fun opening_someoneElse_staysAnOtherPersonProfile() = runTest(dispatcher) {
        val userRepo = mockk<UserRepository>(relaxed = true)
        coEvery { userRepo.getProfile("u2") } returns NetworkResult.Success(MeeshyUser(id = "u2", username = "bob"))

        val vm = viewModel(viewed = "u2", userRepo = userRepo)
        advanceUntilIdle()

        assertThat(vm.state.value.isOwnProfile).isFalse()
        assertThat(vm.state.value.user?.id).isEqualTo("u2")
    }
}

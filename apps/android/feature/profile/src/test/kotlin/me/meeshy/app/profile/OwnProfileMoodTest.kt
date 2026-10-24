package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Mon humeur sur l'avatar de MA page (parité iOS `ProfileOwnAvatar`, #10529) : lue dans le cache des
 * statuts déjà servi — aucune requête —, masquée pendant l'édition (le crayon occupe le coin), et une
 * humeur vide ne peint rien.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class OwnProfileMoodTest {

    private val dispatcher = StandardTestDispatcher()

    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 1_000L
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun status(userId: String, mood: String) = StatusEntry(id = "s-$userId", userId = userId, moodEmoji = mood)

    private fun viewModel(
        statusBarCache: StatusBarCache,
        user: MeeshyUser? = MeeshyUser(id = "me", username = "ada"),
    ): OwnProfileViewModel {
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(user)
        val userRepo = mockk<UserRepository>()
        coEvery { userRepo.getUserStats(any()) } returns NetworkResult.Failure(ApiError("offline"))
        coEvery { userRepo.getUserStatsTimeline(any()) } returns NetworkResult.Failure(ApiError("offline"))
        val statsCache = mockk<ProfileStatsCacheRepository>(relaxed = true)
        coEvery { statsCache.cachedStats(any()) } returns null
        coEvery { statsCache.cachedTimeline() } returns null
        return OwnProfileViewModel(
            sessionRepository = session,
            userRepository = userRepo,
            statsCache = statsCache,
            workManager = mockk(relaxed = true),
            friendshipCache = FriendshipCache(),
            statusBarCache = statusBarCache,
        )
    }

    @Test
    fun `my mood is the emoji of my status`() {
        val statuses = listOf(status("other", "🎉"), status("me", "😊"))
        assertThat(OwnProfileMood.resolve(statuses, "me")).isEqualTo("😊")
    }

    @Test
    fun `no status of mine means no mood`() {
        assertThat(OwnProfileMood.resolve(listOf(status("other", "🎉")), "me")).isNull()
        assertThat(OwnProfileMood.resolve(emptyList(), "me")).isNull()
    }

    @Test
    fun `a blank mood emoji paints nothing`() {
        assertThat(OwnProfileMood.resolve(listOf(status("me", "  ")), "me")).isNull()
        assertThat(OwnProfileMood.shown("", isEditing = false)).isNull()
    }

    @Test
    fun `the mood is hidden while editing`() {
        assertThat(OwnProfileMood.shown("😊", isEditing = true)).isNull()
        assertThat(OwnProfileMood.shown("😊", isEditing = false)).isEqualTo("😊")
        assertThat(OwnProfileMood.shown(null, isEditing = false)).isNull()
    }

    @Test
    fun `the page reads my mood from the status cache it already holds`() = runTest(dispatcher) {
        val cache = StatusBarCache(clock)
        cache.save(StatusFeedMode.FRIENDS, listOf(status("me", "😊")))

        val vm = viewModel(cache)
        advanceUntilIdle()

        assertThat(vm.state.value.moodEmoji).isEqualTo("😊")
    }

    @Test
    fun `an empty status cache leaves the avatar without mood`() = runTest(dispatcher) {
        val vm = viewModel(StatusBarCache(clock))
        advanceUntilIdle()

        assertThat(vm.state.value.moodEmoji).isNull()
    }
}

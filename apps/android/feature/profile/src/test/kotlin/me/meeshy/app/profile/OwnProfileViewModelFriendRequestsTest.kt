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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * La pastille de la ligne « Demandes d'amis » de MA page suit le graphe d'amitié en mémoire
 * (`FriendshipCache.pendingReceivedCount`, parité iOS `pendingRequestCount`) ; et l'ouverture de la
 * page relit mon profil en silence (`sessionRepository.refresh`) sans jamais retirer l'affiché.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class OwnProfileViewModelFriendRequestsTest {

    private val dispatcher = StandardTestDispatcher()

    private val clock = object : CacheClock {
        override fun nowMillis(): Long = 0L
    }

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun received(id: String, from: String) =
        FriendRequest(id = id, senderId = from, receiverId = "me", status = "pending")

    private fun session(flow: MutableStateFlow<MeeshyUser?>): SessionRepository {
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns flow
        return session
    }

    private fun viewModel(
        friendshipCache: FriendshipCache,
        session: SessionRepository = session(MutableStateFlow(MeeshyUser(id = "me", username = "ada"))),
    ): OwnProfileViewModel {
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
            friendshipCache = friendshipCache,
            statusBarCache = StatusBarCache(clock),
        )
    }

    @Test
    fun `the count starts from the requests already in memory`() = runTest(dispatcher) {
        val cache = FriendshipCache()
        cache.hydrate(sent = emptyList(), received = listOf(received("r1", "bob"), received("r2", "eve")))

        val vm = viewModel(cache)
        advanceUntilIdle()

        assertThat(vm.state.value.pendingFriendRequests).isEqualTo(2)
    }

    @Test
    fun `the count follows the cache when a request arrives or is handled`() = runTest(dispatcher) {
        val cache = FriendshipCache()
        val vm = viewModel(cache)
        advanceUntilIdle()
        assertThat(vm.state.value.pendingFriendRequests).isEqualTo(0)

        cache.hydrate(sent = emptyList(), received = listOf(received("r1", "bob")))
        advanceUntilIdle()
        assertThat(vm.state.value.pendingFriendRequests).isEqualTo(1)

        cache.hydrate(sent = emptyList(), received = emptyList())
        advanceUntilIdle()
        assertThat(vm.state.value.pendingFriendRequests).isEqualTo(0)
    }

    @Test
    fun `opening the page refreshes my profile silently`() = runTest(dispatcher) {
        val session = session(MutableStateFlow(MeeshyUser(id = "me", username = "ada")))

        viewModel(FriendshipCache(), session)
        advanceUntilIdle()

        coVerify(exactly = 1) { session.refresh() }
    }

    @Test
    fun `a failed refresh keeps the identity on screen`() = runTest(dispatcher) {
        val shown = MeeshyUser(id = "me", username = "ada")
        val session = session(MutableStateFlow(shown))
        coEvery { session.refresh() } throws IllegalStateException("offline")

        val vm = viewModel(FriendshipCache(), session)
        advanceUntilIdle()

        assertThat(vm.state.value.user).isEqualTo(shown)
    }
}

package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.model.FriendRequest
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The new-conversation picker opens on « Your contacts » (iOS `NewConversationView`): the
 * cached roster at once, the network after, a loading state only on a cold cache, « No
 * contacts » once it answered with nobody — and a contact selects like a search result.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NewConversationContactsTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private fun friend(id: String, name: String = id.uppercase()) =
        FriendRequestUser(id = id, username = id, displayName = name)

    private fun accepted(vararg friends: FriendRequestUser) = friends.mapIndexed { i, f ->
        FriendRequest(id = "r$i", senderId = "me", receiverId = f.id, status = "accepted", sender = friend("me"), receiver = f)
    }

    private fun session() = mockk<SessionRepository>(relaxed = true) { every { currentUserId } returns "me" }

    private fun viewModel(cache: FriendListRepository, network: FriendRepository) =
        NewConversationViewModel(mockk(relaxed = true), mockk(relaxed = true), session(), cache, network, mockk(relaxed = true), mockk(relaxed = true))

    @Test
    fun `the cached roster paints at once, then the network refreshes it`() = runTest(dispatcher) {
        val answer = CompletableDeferred<NetworkResult<List<FriendRequest>>>()
        val cache = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns listOf(friend("ann")) }
        val network = mockk<FriendRepository> { coEvery { acceptedFriendRequests() } coAnswers { answer.await() } }

        val vm = viewModel(cache, network)
        runCurrent()

        assertThat(vm.state.value.showsContacts).isTrue()
        assertThat(vm.state.value.isLoadingContacts).isFalse()
        assertThat(vm.state.value.contacts.map { it.displayName }).containsExactly("ANN")

        answer.complete(NetworkResult.Success(accepted(friend("ann"), friend("bob"))))
        advanceUntilIdle()

        assertThat(vm.state.value.contacts.map { it.id }).containsExactly("ann", "bob")
    }

    @Test
    fun `a cold cache shows the loading state, then no contacts when the roster is empty`() = runTest(dispatcher) {
        val answer = CompletableDeferred<NetworkResult<List<FriendRequest>>>()
        val cache = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns null }
        val network = mockk<FriendRepository> { coEvery { acceptedFriendRequests() } coAnswers { answer.await() } }

        val vm = viewModel(cache, network)
        runCurrent()
        assertThat(vm.state.value.isLoadingContacts).isTrue()
        assertThat(vm.state.value.showsNoContacts).isFalse()

        answer.complete(NetworkResult.Success(emptyList()))
        advanceUntilIdle()

        assertThat(vm.state.value.isLoadingContacts).isFalse()
        assertThat(vm.state.value.showsNoContacts).isTrue()
    }

    @Test
    fun `a failed roster read ends the loading and keeps the cache`() = runTest(dispatcher) {
        val cache = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns listOf(friend("ann")) }
        val network = mockk<FriendRepository> {
            coEvery { acceptedFriendRequests() } returns NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        }

        val vm = viewModel(cache, network)
        advanceUntilIdle()

        assertThat(vm.state.value.isLoadingContacts).isFalse()
        assertThat(vm.state.value.contacts.map { it.id }).containsExactly("ann")
    }

    @Test
    fun `a contact selects like a search result and the search hides the contacts`() = runTest(dispatcher) {
        val cache = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns listOf(friend("ann")) }
        val network = mockk<FriendRepository> {
            coEvery { acceptedFriendRequests() } returns NetworkResult.Success(accepted(friend("ann")))
        }
        val vm = viewModel(cache, network)
        advanceUntilIdle()

        vm.toggleSelection("ann")

        assertThat(vm.state.value.selected.map { it.id }).containsExactly("ann")
        assertThat(vm.state.value.contacts.single().isSelected).isTrue()
        assertThat(vm.state.value.canCreate).isTrue()

        vm.onQueryChange("an")
        assertThat(vm.state.value.showsContacts).isFalse()
    }
}

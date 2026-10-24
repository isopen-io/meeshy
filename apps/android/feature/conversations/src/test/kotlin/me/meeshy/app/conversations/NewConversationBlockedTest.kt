package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.friend.BlockedListRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * A user I blocked is marked « Blocked » in the picker and cannot be picked (iOS
 * `NewConversationView` `isBlocked`: dimmed, disabled) — from the blocked cache at once, then
 * from the gateway.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NewConversationBlockedTest {

    private val dispatcher = StandardTestDispatcher()

    @Before fun setUp() { Dispatchers.setMain(dispatcher) }
    @After fun tearDown() { Dispatchers.resetMain() }

    private fun friend(id: String) = FriendRequestUser(id = id, username = id, displayName = id.uppercase())

    private fun viewModel(cachedBlocked: List<BlockedUser>?, served: NetworkResult<List<BlockedUser>>): NewConversationViewModel {
        val friends = mockk<FriendListRepository> { coEvery { cachedSnapshot() } returns listOf(friend("ann"), friend("bob")) }
        val network = mockk<FriendRepository> {
            coEvery { acceptedFriendRequests() } returns NetworkResult.Failure(ApiError(message = "offline", code = "NETWORK"))
        }
        val blockedCache = mockk<BlockedListRepository> { coEvery { cachedSnapshot() } returns cachedBlocked }
        val blocks = mockk<BlockRepository> { coEvery { listBlocked() } returns served }
        val session = mockk<SessionRepository>(relaxed = true) { every { currentUserId } returns "me" }
        return NewConversationViewModel(mockk(relaxed = true), mockk(relaxed = true), session, friends, network, blockedCache, blocks)
    }

    @Test
    fun `a blocked contact is marked and cannot be picked`() = runTest(dispatcher) {
        val vm = viewModel(listOf(BlockedUser(id = "bob")), NetworkResult.Success(listOf(BlockedUser(id = "bob"))))
        advanceUntilIdle()

        assertThat(vm.state.value.contacts.associate { it.id to it.isBlocked }).containsExactly("ann", false, "bob", true)

        vm.toggleSelection("bob")

        assertThat(vm.state.value.selected).isEmpty()
        assertThat(vm.state.value.canCreate).isFalse()
    }

    @Test
    fun `the gateway list wins over the cache, and an unblocked user is offered again`() = runTest(dispatcher) {
        val vm = viewModel(listOf(BlockedUser(id = "ann")), NetworkResult.Success(emptyList()))
        advanceUntilIdle()

        assertThat(vm.state.value.contacts.none { it.isBlocked }).isTrue()
        vm.toggleSelection("ann")
        assertThat(vm.state.value.selected.map { it.id }).containsExactly("ann")
    }

    @Test
    fun `withBlocked unpicks a row that becomes blocked`() {
        val rows = listOf(SelectableUser("a", "A", "a", null, isOnline = false, isSelected = true))

        val marked = NewConversationLogic.withBlocked(rows, setOf("a"))

        assertThat(marked.single().isBlocked).isTrue()
        assertThat(marked.single().isSelected).isFalse()
    }
}

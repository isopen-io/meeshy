package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryAudiencePickerViewModelTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val friends: FriendListRepository = mockk(relaxed = true)
    private val users: UserRepository = mockk(relaxed = true)
    private val blocks = BlockCache()
    private val session: SessionRepository = mockk(relaxed = true)

    private fun viewModel(
        cached: List<FriendRequestUser>? = listOf(
            FriendRequestUser(id = "a", username = "ana", displayName = "Ana Lima"),
            FriendRequestUser(id = "b", username = "bob"),
            FriendRequestUser(id = "me", username = "me"),
        ),
    ): StoryAudiencePickerViewModel {
        coEvery { friends.cachedSnapshot() } returns cached
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        return StoryAudiencePickerViewModel(friends, users, blocks, session).also { it.searchDebounceMs = 0L }
    }

    @Test
    fun `les contacts du cache paraissent d'abord, sans soi`() = runTest {
        val vm = viewModel()
        vm.start(initialSelection = emptyList())

        assertThat(vm.state.value.results.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `une personne bloquee n'est jamais proposee`() = runTest {
        blocks.hydrate(listOf(me.meeshy.sdk.model.friend.BlockedUser(id = "b", username = "bob")))
        val vm = viewModel()
        vm.start(emptyList())

        assertThat(vm.state.value.results.map { it.id }).containsExactly("a")
    }

    @Test
    fun `la recherche filtre d'abord le local puis complete par l'annuaire, hors soi et bloques`() = runTest {
        blocks.hydrate(listOf(me.meeshy.sdk.model.friend.BlockedUser(id = "x", username = "xavier")))
        coEvery { users.searchUsers("an", any(), any()) } returns NetworkResult.Success(
            listOf(
                UserSearchResult(id = "a", username = "ana"),
                UserSearchResult(id = "c", username = "anna"),
                UserSearchResult(id = "x", username = "xavier"),
                UserSearchResult(id = "me", username = "me"),
            ),
        )
        val vm = viewModel()
        vm.start(emptyList())

        vm.onQueryChange("an")

        assertThat(vm.state.value.results.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `un echec reseau garde les resultats locaux`() = runTest {
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Failure(ApiError("offline"))
        val vm = viewModel()
        vm.start(emptyList())

        vm.onQueryChange("ana")

        assertThat(vm.state.value.results.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.isSearching).isFalse()
    }

    @Test
    fun `basculer une personne la selectionne puis la retire, et la validation rend la liste dans l'ordre`() = runTest {
        val vm = viewModel()
        vm.start(initialSelection = listOf("a"))

        vm.onToggle("b")
        assertThat(vm.state.value.selectedIds).containsExactly("a", "b").inOrder()
        vm.onToggle("a")
        assertThat(vm.state.value.selectedIds).containsExactly("b")
    }

    @Test
    fun `une selection initiale bloquee depuis est ecartee a l'ouverture`() = runTest {
        blocks.hydrate(listOf(me.meeshy.sdk.model.friend.BlockedUser(id = "b", username = "bob")))
        val vm = viewModel()
        vm.start(initialSelection = listOf("a", "b", "me"))

        assertThat(vm.state.value.selectedIds).containsExactly("a")
    }

    @Test
    fun `un cache froid donne une liste vide sans erreur`() = runTest {
        val vm = viewModel(cached = null)
        vm.start(emptyList())

        assertThat(vm.state.value.results).isEmpty()
        assertThat(vm.state.value.hasLoadedContacts).isTrue()
    }
}

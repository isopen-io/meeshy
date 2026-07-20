package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NewConversationViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(
        users: UserRepository = mockk(relaxed = true),
        conversations: ConversationRepository = mockk(relaxed = true),
    ) = NewConversationViewModel(users, conversations)

    private fun results(vararg ids: String) =
        ids.map { UserSearchResult(id = it, username = it, displayName = it.uppercase()) }

    @Test
    fun debounced_query_triggers_search_and_populates_rows() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Success(results("u1", "u2"))
        val vm = viewModel(users = users)

        vm.onQueryChange("ali")
        advanceUntilIdle()

        assertThat(vm.state.value.results.map { it.id }).containsExactly("u1", "u2")
        coVerify(exactly = 1) { users.searchUsers("ali", any(), any()) }
    }

    @Test
    fun short_query_does_not_hit_the_network() = runTest(dispatcher) {
        val users = mockk<UserRepository>(relaxed = true)
        val vm = viewModel(users = users)

        vm.onQueryChange("a")
        advanceUntilIdle()

        assertThat(vm.state.value.results).isEmpty()
        coVerify(exactly = 0) { users.searchUsers(any(), any(), any()) }
    }

    @Test
    fun toggling_selection_adds_then_removes() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Success(results("u1"))
        val vm = viewModel(users = users)

        vm.onQueryChange("bob")
        advanceUntilIdle()
        vm.toggleSelection("u1")

        assertThat(vm.state.value.selected.map { it.id }).containsExactly("u1")
        assertThat(vm.state.value.canCreate).isTrue()

        vm.toggleSelection("u1")
        assertThat(vm.state.value.selected).isEmpty()
        assertThat(vm.state.value.canCreate).isFalse()
    }

    @Test
    fun selection_survives_a_new_search() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers("first", any(), any()) } returns NetworkResult.Success(results("u1"))
        coEvery { users.searchUsers("second", any(), any()) } returns NetworkResult.Success(results("u9"))
        val vm = viewModel(users = users)

        vm.onQueryChange("first")
        advanceUntilIdle()
        vm.toggleSelection("u1")

        vm.onQueryChange("second")
        advanceUntilIdle()

        assertThat(vm.state.value.selected.map { it.id }).containsExactly("u1")
        assertThat(vm.state.value.results.map { it.id }).containsExactly("u9")
    }

    @Test
    fun creating_a_single_selection_makes_a_direct_conversation() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Success(results("u1"))
        val conversations = mockk<ConversationRepository>()
        coEvery { conversations.create(any(), any(), any()) } returns
            NetworkResult.Success(ApiConversation(id = "c-new"))
        val vm = viewModel(users = users, conversations = conversations)

        vm.onQueryChange("bob")
        advanceUntilIdle()
        vm.toggleSelection("u1")
        vm.create()
        advanceUntilIdle()

        coVerify { conversations.create(NewConversationLogic.TYPE_DIRECT, null, listOf("u1")) }
        assertThat(vm.state.value.createdConversationId).isEqualTo("c-new")
    }

    @Test
    fun creating_two_selections_makes_a_titled_group() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Success(results("u1", "u2"))
        val conversations = mockk<ConversationRepository>()
        coEvery { conversations.create(any(), any(), any()) } returns
            NetworkResult.Success(ApiConversation(id = "g-new"))
        val vm = viewModel(users = users, conversations = conversations)

        vm.onQueryChange("team")
        advanceUntilIdle()
        vm.toggleSelection("u1")
        vm.toggleSelection("u2")
        vm.onGroupTitleChange("Squad")
        vm.create()
        advanceUntilIdle()

        coVerify { conversations.create(NewConversationLogic.TYPE_GROUP, "Squad", listOf("u1", "u2")) }
        assertThat(vm.state.value.createdConversationId).isEqualTo("g-new")
    }

    @Test
    fun create_failure_surfaces_an_error_and_clears_creating() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers(any(), any(), any()) } returns NetworkResult.Success(results("u1"))
        val conversations = mockk<ConversationRepository>()
        coEvery { conversations.create(any(), any(), any()) } returns
            NetworkResult.Failure(ApiError(code = "boom", message = "Network down"))
        val vm = viewModel(users = users, conversations = conversations)

        vm.onQueryChange("bob")
        advanceUntilIdle()
        vm.toggleSelection("u1")
        vm.create()
        advanceUntilIdle()

        assertThat(vm.state.value.isCreating).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("Network down")
        assertThat(vm.state.value.createdConversationId).isNull()
    }
}

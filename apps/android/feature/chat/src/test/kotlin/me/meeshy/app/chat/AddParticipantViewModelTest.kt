package me.meeshy.app.chat

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
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AddParticipantViewModelTest {

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
    ) = AddParticipantViewModel(users, conversations)

    private fun results(vararg ids: String) =
        ids.map { UserSearchResult(id = it, username = it, displayName = it.uppercase()) }

    @Test
    fun debounced_query_triggers_search_and_populates_rows() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers("ali", any(), any()) } returns NetworkResult.Success(results("u1", "u2"))
        val vm = viewModel(users = users)
        vm.load("c1", existingMemberIds = emptySet())

        vm.onQueryChange("ali")
        advanceUntilIdle()

        assertThat(vm.state.value.results.map { it.id }).containsExactly("u1", "u2")
        coVerify(exactly = 1) { users.searchUsers("ali", any(), any()) }
    }

    @Test
    fun short_query_does_not_hit_the_network() = runTest(dispatcher) {
        val users = mockk<UserRepository>(relaxed = true)
        val vm = viewModel(users = users)
        vm.load("c1", existingMemberIds = emptySet())

        vm.onQueryChange("a")
        advanceUntilIdle()

        assertThat(vm.state.value.results).isEmpty()
        coVerify(exactly = 0) { users.searchUsers(any(), any(), any()) }
    }

    @Test
    fun an_existing_member_is_flagged_and_never_offered_the_add_button() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsers("ali", any(), any()) } returns NetworkResult.Success(results("u1", "u2"))
        val vm = viewModel(users = users)
        vm.load("c1", existingMemberIds = setOf("u1"))

        vm.onQueryChange("ali")
        advanceUntilIdle()

        assertThat(vm.state.value.results.first { it.id == "u1" }.isMember).isTrue()
        assertThat(vm.state.value.results.first { it.id == "u2" }.isMember).isFalse()
    }

    @Test
    fun adding_a_user_calls_the_repository_and_marks_the_row_as_a_member() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        val conversations = mockk<ConversationRepository>()
        coEvery { users.searchUsers("ali", any(), any()) } returns NetworkResult.Success(results("u1"))
        coEvery { conversations.addParticipant("c1", "u1") } returns NetworkResult.Success(Unit)
        val vm = viewModel(users = users, conversations = conversations)
        vm.load("c1", existingMemberIds = emptySet())
        vm.onQueryChange("ali")
        advanceUntilIdle()

        var onAddedCalls = 0
        vm.addParticipant("u1") { onAddedCalls++ }
        advanceUntilIdle()

        coVerify(exactly = 1) { conversations.addParticipant("c1", "u1") }
        assertThat(vm.state.value.results.first { it.id == "u1" }.isMember).isTrue()
        assertThat(vm.state.value.results.first { it.id == "u1" }.isAdding).isFalse()
        assertThat(onAddedCalls).isEqualTo(1)
    }

    @Test
    fun a_refused_add_rolls_back_to_offering_the_button_again_and_surfaces_an_error() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        val conversations = mockk<ConversationRepository>()
        coEvery { users.searchUsers("ali", any(), any()) } returns NetworkResult.Success(results("u1"))
        coEvery { conversations.addParticipant("c1", "u1") } returns
            NetworkResult.Failure(ApiError(message = "Only admins and moderators can add participants"))
        val vm = viewModel(users = users, conversations = conversations)
        vm.load("c1", existingMemberIds = emptySet())
        vm.onQueryChange("ali")
        advanceUntilIdle()

        var onAddedCalls = 0
        vm.addParticipant("u1") { onAddedCalls++ }
        advanceUntilIdle()

        assertThat(vm.state.value.results.first { it.id == "u1" }.isMember).isFalse()
        assertThat(vm.state.value.results.first { it.id == "u1" }.isAdding).isFalse()
        assertThat(vm.state.value.errorMessage).isEqualTo("Only admins and moderators can add participants")
        assertThat(onAddedCalls).isEqualTo(0)
    }

    @Test
    fun adding_the_same_user_twice_while_the_first_call_is_in_flight_is_a_no_op() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        val conversations = mockk<ConversationRepository>()
        coEvery { users.searchUsers("ali", any(), any()) } returns NetworkResult.Success(results("u1"))
        coEvery { conversations.addParticipant("c1", "u1") } returns NetworkResult.Success(Unit)
        val vm = viewModel(users = users, conversations = conversations)
        vm.load("c1", existingMemberIds = emptySet())
        vm.onQueryChange("ali")
        advanceUntilIdle()

        vm.addParticipant("u1") {}
        vm.addParticipant("u1") {}
        advanceUntilIdle()

        coVerify(exactly = 1) { conversations.addParticipant("c1", "u1") }
    }
}

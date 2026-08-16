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
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
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

    private fun paged(ids: List<String>, hasMore: Boolean = false, offset: Int = 0) =
        NetworkResult.Success(
            PagedResult(
                data = ids.map { UserSearchResult(id = it, username = it, displayName = it.uppercase()) },
                pagination = Pagination(total = null, offset = offset, limit = 20, hasMore = hasMore),
            ),
        )

    @Test
    fun debounced_query_triggers_search_and_populates_rows() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsersPaged(any(), any(), any()) } returns paged(listOf("u1", "u2"))
        val vm = viewModel(users = users)

        vm.onQueryChange("ali")
        advanceUntilIdle()

        assertThat(vm.state.value.results.map { it.id }).containsExactly("u1", "u2")
        coVerify(exactly = 1) { users.searchUsersPaged("ali", any(), any()) }
    }

    @Test
    fun short_query_does_not_hit_the_network() = runTest(dispatcher) {
        val users = mockk<UserRepository>(relaxed = true)
        val vm = viewModel(users = users)

        vm.onQueryChange("a")
        advanceUntilIdle()

        assertThat(vm.state.value.results).isEmpty()
        coVerify(exactly = 0) { users.searchUsersPaged(any(), any(), any()) }
    }

    @Test
    fun toggling_selection_adds_then_removes() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsersPaged(any(), any(), any()) } returns paged(listOf("u1"))
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
        coEvery { users.searchUsersPaged("first", any(), any()) } returns paged(listOf("u1"))
        coEvery { users.searchUsersPaged("second", any(), any()) } returns paged(listOf("u9"))
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
    fun a_fresh_search_resets_hasMore_and_the_page_offset() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsersPaged("first", any(), any()) } returns paged(listOf("u1"), hasMore = true)
        coEvery { users.searchUsersPaged("second", any(), any()) } returns paged(listOf("u9"), hasMore = false)
        val vm = viewModel(users = users)

        vm.onQueryChange("first")
        advanceUntilIdle()
        assertThat(vm.state.value.hasMore).isTrue()

        vm.onQueryChange("second")
        advanceUntilIdle()

        assertThat(vm.state.value.hasMore).isFalse()
        coVerify(exactly = 1) { users.searchUsersPaged("second", any(), 0) }
    }

    @Test
    fun loadMoreIfNeeded_appends_the_next_page_when_a_row_near_the_end_is_visible() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsersPaged("bob", any(), 0) } returns paged(listOf("u1", "u2"), hasMore = true)
        coEvery { users.searchUsersPaged("bob", any(), 2) } returns paged(listOf("u3"), hasMore = false, offset = 2)
        val vm = viewModel(users = users)
        vm.onQueryChange("bob")
        advanceUntilIdle()

        vm.loadMoreIfNeeded("u2")
        advanceUntilIdle()

        assertThat(vm.state.value.results.map { it.id }).containsExactly("u1", "u2", "u3").inOrder()
        assertThat(vm.state.value.hasMore).isFalse()
        coVerify(exactly = 1) { users.searchUsersPaged("bob", any(), 2) }
    }

    @Test
    fun loadMoreIfNeeded_is_a_no_op_when_there_is_no_more_data() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsersPaged("bob", any(), 0) } returns paged(listOf("u1"), hasMore = false)
        val vm = viewModel(users = users)
        vm.onQueryChange("bob")
        advanceUntilIdle()

        vm.loadMoreIfNeeded("u1")
        advanceUntilIdle()

        coVerify(exactly = 0) { users.searchUsersPaged(any(), any(), 20) }
        coVerify(exactly = 1) { users.searchUsersPaged("bob", any(), 0) }
    }

    @Test
    fun loadMoreIfNeeded_is_a_no_op_for_a_row_far_from_the_end() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        val many = (1..10).map { "u$it" }
        coEvery { users.searchUsersPaged("bob", any(), 0) } returns paged(many, hasMore = true)
        val vm = viewModel(users = users)
        vm.onQueryChange("bob")
        advanceUntilIdle()

        vm.loadMoreIfNeeded("u1")
        advanceUntilIdle()

        coVerify(exactly = 1) { users.searchUsersPaged("bob", any(), any()) }
    }

    @Test
    fun creating_a_single_selection_makes_a_direct_conversation() = runTest(dispatcher) {
        val users = mockk<UserRepository>()
        coEvery { users.searchUsersPaged(any(), any(), any()) } returns paged(listOf("u1"))
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
        coEvery { users.searchUsersPaged(any(), any(), any()) } returns paged(listOf("u1", "u2"))
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
        coEvery { users.searchUsersPaged(any(), any(), any()) } returns paged(listOf("u1"))
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

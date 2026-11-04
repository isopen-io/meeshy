package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.friend.BlockRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.friend.BlockedUser
import me.meeshy.sdk.model.CreationEncryptionMode
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.PagedResult
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * Décision porteur du 2026-11-04 (#14646) : en mode DIRECT, un seul toucher sur une personne ouvre
 * (ou crée puis ouvre) la conversation avec elle, comme le web ; le mode GROUPE garde sélection et « Créer ».
 */
@OptIn(ExperimentalCoroutinesApi::class)
class NewConversationOneTapTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun session(role: String = "USER") = mockk<SessionRepository>(relaxed = true) {
        every { currentUserId } returns "me"
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", role = role))
    }

    private fun picker(vararg ids: String): UserRepository = mockk {
        coEvery { searchUsersPaged(any(), any(), any()) } returns NetworkResult.Success(
            PagedResult(
                data = ids.map { UserSearchResult(id = it, username = it, displayName = it.uppercase()) },
                pagination = Pagination(total = null, offset = 0, limit = 20, hasMore = false),
            ),
        )
    }

    private fun conversationsAnswering(result: NetworkResult<ApiConversation>) = mockk<ConversationRepository> {
        coEvery { create(any(), any(), any(), any()) } returns result
    }

    private fun viewModel(
        conversations: ConversationRepository = mockk(relaxed = true),
        role: String = "USER",
        blocks: BlockRepository = mockk(relaxed = true),
    ) = NewConversationViewModel(
        picker("u1", "u2"),
        conversations,
        session(role),
        mockk(relaxed = true),
        mockk(relaxed = true),
        mockk(relaxed = true),
        blocks,
    )

    private fun kotlinx.coroutines.test.TestScope.searched(vm: NewConversationViewModel) {
        vm.onQueryChange("bob")
        advanceUntilIdle()
    }

    @Test
    fun a_tap_in_direct_mode_opens_the_conversation_at_once() = runTest(dispatcher) {
        val conversations = conversationsAnswering(NetworkResult.Success(ApiConversation(id = "c-1")))
        val vm = viewModel(conversations)
        searched(vm)

        vm.onPersonTapped("u1")
        advanceUntilIdle()

        coVerify(exactly = 1) { conversations.create(NewConversationLogic.TYPE_DIRECT, null, listOf("u1"), "server") }
        assertThat(vm.state.value.createdConversationId).isEqualTo("c-1")
        assertThat(vm.state.value.selected).isEmpty()
        assertThat(vm.state.value.openingUserId).isNull()
    }

    @Test
    fun while_opening_the_touched_row_says_so_and_a_second_tap_is_ignored() = runTest(dispatcher) {
        val answer = CompletableDeferred<NetworkResult<ApiConversation>>()
        val conversations = mockk<ConversationRepository> {
            coEvery { create(any(), any(), any(), any()) } coAnswers { answer.await() }
        }
        val vm = viewModel(conversations)
        searched(vm)

        vm.onPersonTapped("u1")
        runCurrent()
        assertThat(vm.state.value.openingUserId).isEqualTo("u1")
        assertThat(vm.state.value.isCreating).isTrue()

        vm.onPersonTapped("u2")
        answer.complete(NetworkResult.Success(ApiConversation(id = "c-1")))
        advanceUntilIdle()

        coVerify(exactly = 1) { conversations.create(any(), any(), any(), any()) }
        assertThat(vm.state.value.openingUserId).isNull()
    }

    @Test
    fun a_failed_open_keeps_the_sheet_with_the_message_and_frees_the_row() = runTest(dispatcher) {
        val conversations = conversationsAnswering(NetworkResult.Failure(ApiError(code = "boom", message = "x")))
        val vm = viewModel(conversations)
        searched(vm)

        vm.onPersonTapped("u1")
        advanceUntilIdle()

        assertThat(vm.state.value.error).isEqualTo(NewConversationError.CREATE_FAILED)
        assertThat(vm.state.value.isCreating).isFalse()
        assertThat(vm.state.value.openingUserId).isNull()
        assertThat(vm.state.value.createdConversationId).isNull()
    }

    @Test
    fun the_checked_encryption_mode_leaves_with_the_tap() = runTest(dispatcher) {
        val conversations = conversationsAnswering(NetworkResult.Success(ApiConversation(id = "c-1")))
        val vm = viewModel(conversations)
        searched(vm)

        vm.selectEncryptionMode(CreationEncryptionMode.HYBRID)
        vm.onPersonTapped("u1")
        advanceUntilIdle()

        coVerify { conversations.create(NewConversationLogic.TYPE_DIRECT, null, listOf("u1"), "hybrid") }
    }

    @Test
    fun the_sheet_opens_on_a_direct_offer_with_the_encryption_row_and_no_create() = runTest(dispatcher) {
        val vm = viewModel(role = "ANALYST")
        advanceUntilIdle()

        assertThat(vm.state.value.showsCreate).isFalse()
        assertThat(vm.state.value.showsEncryption).isTrue()
        assertThat(vm.state.value.encryptionMode).isEqualTo(CreationEncryptionMode.E2EE)
    }

    @Test
    fun in_group_mode_a_tap_selects_and_creates_nothing() = runTest(dispatcher) {
        val conversations = mockk<ConversationRepository>(relaxed = true)
        val vm = viewModel(conversations)
        searched(vm)

        vm.toggleGroupRequested()
        vm.onPersonTapped("u1")
        advanceUntilIdle()

        assertThat(vm.state.value.selected.map { it.id }).containsExactly("u1")
        assertThat(vm.state.value.showsCreate).isTrue()
        coVerify(exactly = 0) { conversations.create(any(), any(), any(), any()) }
    }

    @Test
    fun turning_the_group_switch_off_drops_the_lone_pick() = runTest(dispatcher) {
        val vm = viewModel()
        searched(vm)

        vm.toggleGroupRequested()
        vm.onPersonTapped("u1")
        vm.toggleGroupRequested()

        assertThat(vm.state.value.groupRequested).isFalse()
        assertThat(vm.state.value.selected).isEmpty()
        assertThat(vm.state.value.results.none { it.isSelected }).isTrue()
    }

    @Test
    fun a_blocked_person_does_not_open_anything() = runTest(dispatcher) {
        val conversations = mockk<ConversationRepository>(relaxed = true)
        val blocks = mockk<BlockRepository> { coEvery { listBlocked() } returns NetworkResult.Success(listOf(BlockedUser(id = "u1"))) }
        val vm = viewModel(conversations, blocks = blocks)
        searched(vm)

        vm.onPersonTapped("u1")
        advanceUntilIdle()

        coVerify(exactly = 0) { conversations.create(any(), any(), any(), any()) }
        assertThat(vm.state.value.openingUserId).isNull()
    }
}

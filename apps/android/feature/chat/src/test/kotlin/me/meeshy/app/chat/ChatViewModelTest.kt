package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.ui.component.bubble.DeliveryStatus
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun synced(message: ApiMessage) = LocalMessage(message)

    private fun socketManager(): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { messageReceived } returns MutableSharedFlow()
            every { messageUpdated } returns MutableSharedFlow()
            every { messageDeleted } returns MutableSharedFlow()
            every { typingStarted } returns MutableSharedFlow()
            every { typingStopped } returns MutableSharedFlow()
        }

    private fun viewModel(
        stream: Flow<CacheResult<List<LocalMessage>>>,
        currentUser: MeeshyUser? = null,
    ): Triple<ChatViewModel, MessageRepository, WorkManager> {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns stream
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(currentUser)
        val workManager = mockk<WorkManager>(relaxed = true)
        val handle = SavedStateHandle(mapOf(ChatViewModel.CONVERSATION_ID_ARG to "c1"))
        return Triple(
            ChatViewModel(repo, session, socketManager(), workManager, handle),
            repo,
            workManager,
        )
    }

    @Test
    fun fresh_result_populates_message_bubbles() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            flowOf(
                CacheResult.Fresh(
                    listOf(synced(ApiMessage(id = "m1", conversationId = "c1", content = "hi"))),
                    ageMillis = 0,
                ),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.messages).hasSize(1)
        assertThat(vm.state.value.messages.single().text).isEqualTo("hi")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun own_messages_are_outgoing_once_the_session_is_known() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            stream = flowOf(
                CacheResult.Fresh(
                    listOf(
                        synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = "mine")),
                        synced(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "theirs")),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = MeeshyUser(id = "me", username = "atabeth"),
        )
        advanceUntilIdle()

        val bubbles = vm.state.value.messages
        assertThat(bubbles.single { it.messageId == "m1" }.isOutgoing).isTrue()
        assertThat(bubbles.single { it.messageId == "m2" }.isOutgoing).isFalse()
    }

    @Test
    fun sending_and_failed_bubbles_surface_their_delivery_status() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            stream = flowOf(
                CacheResult.Fresh(
                    listOf(
                        LocalMessage(
                            ApiMessage(id = "cmid_a", conversationId = "c1", senderId = "me", content = "pending"),
                            LocalSendState.SENDING,
                        ),
                        LocalMessage(
                            ApiMessage(id = "cmid_b", conversationId = "c1", senderId = "me", content = "broken"),
                            LocalSendState.FAILED,
                        ),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = MeeshyUser(id = "me", username = "atabeth"),
        )
        advanceUntilIdle()

        val bubbles = vm.state.value.messages
        assertThat(bubbles.single { it.messageId == "cmid_a" }.deliveryStatus)
            .isEqualTo(DeliveryStatus.Pending)
        assertThat(bubbles.single { it.messageId == "cmid_b" }.deliveryStatus)
            .isEqualTo(DeliveryStatus.Failed)
    }

    @Test
    fun empty_result_shows_the_skeleton() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
    }

    @Test
    fun draft_change_updates_state_and_gates_sending() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()
        assertThat(vm.state.value.canSend).isFalse()

        vm.onDraftChange("hello")

        assertThat(vm.state.value.draft).isEqualTo("hello")
        assertThat(vm.state.value.canSend).isTrue()
    }

    @Test
    fun send_dispatches_an_optimistic_message_and_clears_the_draft() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, workManager) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        vm.onDraftChange("hello")
        vm.send()
        advanceUntilIdle()

        assertThat(vm.state.value.draft).isEmpty()
        coVerify { repo.sendOptimistic("c1", "hello", "fr", user, null) }
        coVerify { workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun retryMessage_delegates_to_the_repository_and_reschedules_the_flush() = runTest(dispatcher) {
        val (vm, repo, workManager) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.retryMessage("cmid_x")
        advanceUntilIdle()

        coVerify { repo.retrySend("cmid_x") }
        coVerify { workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }
}

package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.NetworkResult
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

    private fun viewModel(
        stream: Flow<CacheResult<List<ApiMessage>>>,
    ): Pair<ChatViewModel, MessageRepository> {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns stream
        val handle = SavedStateHandle(mapOf(ChatViewModel.CONVERSATION_ID_ARG to "c1"))
        return ChatViewModel(repo, handle) to repo
    }

    @Test
    fun fresh_result_populates_message_bubbles() = runTest(dispatcher) {
        val (vm, _) = viewModel(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiMessage(id = "m1", conversationId = "c1", content = "hi")),
                ),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.messages).hasSize(1)
        assertThat(vm.state.value.messages.single().text).isEqualTo("hi")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun empty_result_shows_the_skeleton() = runTest(dispatcher) {
        val (vm, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
    }

    @Test
    fun draft_change_updates_state_and_gates_sending() = runTest(dispatcher) {
        val (vm, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()
        assertThat(vm.state.value.canSend).isFalse()

        vm.onDraftChange("hello")

        assertThat(vm.state.value.draft).isEqualTo("hello")
        assertThat(vm.state.value.canSend).isTrue()
    }

    @Test
    fun send_dispatches_the_message_and_clears_the_draft() = runTest(dispatcher) {
        val (vm, repo) = viewModel(flowOf(CacheResult.Empty))
        coEvery { repo.send(any(), any(), any(), any()) } returns
            NetworkResult.Success(ApiMessage(id = "m1", conversationId = "c1"))
        advanceUntilIdle()

        vm.onDraftChange("hello")
        vm.send()
        advanceUntilIdle()

        assertThat(vm.state.value.draft).isEmpty()
        coVerify { repo.send("c1", "hello", any(), any()) }
    }
}

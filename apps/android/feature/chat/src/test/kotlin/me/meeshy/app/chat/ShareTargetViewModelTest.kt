package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ShareTargetViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val me = MeeshyUser(id = "me", username = "me")

    private fun conversation(id: String, title: String) =
        ApiConversation(id = id, title = title, type = "group")

    private data class Harness(
        val vm: ShareTargetViewModel,
        val messages: MessageRepository,
        val workManager: WorkManager,
    )

    private fun harness(
        currentUser: MeeshyUser? = me,
        conversations: List<ApiConversation> = listOf(conversation("c1", "Alice"), conversation("c2", "Bob")),
    ): Harness {
        val conversationRepo = mockk<ConversationRepository>(relaxed = true)
        every { conversationRepo.conversationsStream(any(), any()) } returns
            flowOf(CacheResult.Fresh(conversations, ageMillis = 0))
        val messages = mockk<MessageRepository>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(currentUser)
        val workManager = mockk<WorkManager>(relaxed = true)
        val vm = ShareTargetViewModel(conversationRepo, messages, session, workManager)
        return Harness(vm, messages, workManager)
    }

    @Test
    fun load_populates_the_conversation_picker_from_the_cache_first_stream() = runTest(dispatcher) {
        val h = harness()
        h.vm.load("hello from another app")
        advanceUntilIdle()

        assertThat(h.vm.state.value.targets.map { it.conversationId }).containsExactly("c1", "c2").inOrder()
    }

    @Test
    fun onQueryChange_filters_the_picker_by_title() = runTest(dispatcher) {
        val h = harness()
        h.vm.load("hello")
        advanceUntilIdle()

        h.vm.onQueryChange("ali")
        advanceUntilIdle()

        assertThat(h.vm.state.value.targets.map { it.conversationId }).containsExactly("c1")
    }

    @Test
    fun sendTo_sends_the_shared_text_and_marks_the_target_sent_and_finished() = runTest(dispatcher) {
        val h = harness()
        h.vm.load("hello from another app")
        advanceUntilIdle()

        h.vm.sendTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) {
            h.messages.sendOptimistic(
                conversationId = "c2",
                content = "hello from another app",
                originalLanguage = any(),
                sender = me,
            )
        }
        verify(atLeast = 1) { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
        assertThat(h.vm.state.value.sentConversationIds).containsExactly("c2")
        assertThat(h.vm.state.value.sendingConversationId).isNull()
        assertThat(h.vm.state.value.isFinished).isTrue()
    }

    @Test
    fun sendTo_a_second_target_while_the_first_is_in_flight_is_a_no_op() = runTest(dispatcher) {
        val h = harness()
        h.vm.load("hello")
        advanceUntilIdle()

        h.vm.sendTo("c1")
        h.vm.sendTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) { h.messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun sendTo_with_no_shared_text_never_hits_the_network() = runTest(dispatcher) {
        val h = harness()
        h.vm.load("   ")
        advanceUntilIdle()

        h.vm.sendTo("c1")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun sendTo_with_no_signed_in_user_never_hits_the_network() = runTest(dispatcher) {
        val h = harness(currentUser = null)
        h.vm.load("hello")
        advanceUntilIdle()

        h.vm.sendTo("c1")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.messages.sendOptimistic(any(), any(), any(), any()) }
    }

    @Test
    fun a_failed_send_surfaces_an_error_and_clears_the_sending_flag() = runTest(dispatcher) {
        val h = harness()
        io.mockk.coEvery {
            h.messages.sendOptimistic(any(), any(), any(), any())
        } throws RuntimeException("offline")
        h.vm.load("hello")
        advanceUntilIdle()

        h.vm.sendTo("c1")
        advanceUntilIdle()

        assertThat(h.vm.state.value.sendingConversationId).isNull()
        assertThat(h.vm.state.value.errorMessage).isEqualTo("offline")
        assertThat(h.vm.state.value.isFinished).isFalse()
    }
}

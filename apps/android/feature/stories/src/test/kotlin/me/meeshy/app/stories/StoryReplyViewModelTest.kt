package me.meeshy.app.stories

import androidx.work.WorkManager
import androidx.work.WorkRequest
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.DirectConversationResolution
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryReplyViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()
    private val conversations: ConversationRepository = mockk(relaxed = true)
    private val messages: MessageRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val workManager: WorkManager = mockk(relaxed = true)

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me", systemLanguage = "fr"))
    }

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel() = StoryReplyViewModel(conversations, messages, session, workManager)

    private fun direct(id: String) = DirectConversationResolution.Found(mockk(relaxed = true) { every { this@mockk.id } returns id }, fromCache = false)

    @Test
    fun `the reply leaves in the direct conversation with the author, quoting the story`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns direct("c1")
        val vm = viewModel()
        vm.onTextChange("  trop bien  ")

        vm.send(storyId = "story-1", authorId = "author")

        coVerify(exactly = 1) {
            messages.sendOptimistic(
                conversationId = "c1",
                content = "trop bien",
                originalLanguage = any(),
                sender = any(),
                storyReplyToId = "story-1",
            )
        }
        verify(exactly = 1) { workManager.enqueue(any<WorkRequest>()) }
        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.SENT)
        assertThat(vm.state.value.text).isEmpty()
    }

    @Test
    fun `a reply with no words does not leave`() = runTest(dispatcher) {
        val vm = viewModel()
        vm.onTextChange("   ")

        vm.send("story-1", "author")

        coVerify(exactly = 0) { conversations.directConversationWith(any()) }
        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.IDLE)
    }

    @Test
    fun `when the conversation cannot be opened the words come back and the failure is told`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns DirectConversationResolution.Queued("author")
        val vm = viewModel()
        vm.onTextChange("trop bien")

        vm.send("story-1", "author")

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.FAILED)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
        coVerify(exactly = 0) { messages.sendOptimistic(conversationId = any(), content = any(), originalLanguage = any(), sender = any(), storyReplyToId = any()) }
    }

    @Test
    fun `words typed again while the failure is told are not overwritten, and the outcome is consumed once`() = runTest(dispatcher) {
        coEvery { conversations.directConversationWith("author") } returns DirectConversationResolution.Queued("author")
        val vm = viewModel()
        vm.onTextChange("trop bien")
        vm.send("story-1", "author")

        vm.consumeOutcome()

        assertThat(vm.state.value.phase).isEqualTo(StoryReplyPhase.IDLE)
        assertThat(vm.state.value.text).isEqualTo("trop bien")
    }
}

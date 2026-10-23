package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageSender
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListObserversTypingTest {

    private class Rig(
        val state: MutableStateFlow<ConversationListUiState>,
        val started: MutableSharedFlow<TypingEvent>,
        val received: MutableSharedFlow<ApiMessage>,
    )

    private fun TestScope.rig(): Rig {
        val started = MutableSharedFlow<TypingEvent>(extraBufferCapacity = 16)
        val received = MutableSharedFlow<ApiMessage>(extraBufferCapacity = 16)
        val state = MutableStateFlow(ConversationListUiState(currentUserId = "me"))
        ConversationListObservers(
            scope = backgroundScope,
            state = state,
            messageSocketManager = mockk<MessageSocketManager> {
                every { userStatus } returns MutableSharedFlow()
                every { presenceSnapshot } returns MutableSharedFlow()
                every { typingStarted } returns started
                every { typingStopped } returns MutableSharedFlow()
                every { messageReceived } returns received
            },
            typingPresenceRelay = mockk<TypingPresenceRelay> { every { forcedOnline } returns MutableSharedFlow<UserStatusEvent>() },
            categoryRepository = mockk(relaxed = true),
            categorySocketManager = mockk(relaxed = true),
            storyRepository = mockk(relaxed = true) { every { storiesStream(any(), any()) } returns emptyFlow() },
            statusBarCache = mockk(relaxed = true) { every { load(any()) } returns CacheResult.Empty },
        ).startLive()
        return Rig(state, started, received)
    }

    private fun typing(userId: String = "ali") =
        TypingEvent(conversationId = "c1", userId = userId, displayName = "Ali")

    @Test
    fun `a message received from X ends X typing in that conversation`() = runTest(StandardTestDispatcher()) {
        val rig = rig()
        runCurrent()
        rig.started.emit(typing())
        runCurrent()
        assertThat(rig.state.value.typers["c1"]).isNotNull()

        rig.received.emit(ApiMessage(id = "m1", conversationId = "c1", senderId = "ali"))
        runCurrent()

        assertThat(rig.state.value.typers).doesNotContainKey("c1")
    }

    @Test
    fun `a message from X resolved through the sender envelope also ends the typing`() =
        runTest(StandardTestDispatcher()) {
            val rig = rig()
            runCurrent()
            rig.started.emit(typing())
            runCurrent()

            rig.received.emit(
                ApiMessage(id = "m1", conversationId = "c1", sender = ApiMessageSender(userId = "ali")),
            )
            runCurrent()

            assertThat(rig.state.value.typers).doesNotContainKey("c1")
        }

    @Test
    fun `a message from someone else leaves the typing of X alone`() = runTest(StandardTestDispatcher()) {
        val rig = rig()
        runCurrent()
        rig.started.emit(typing())
        runCurrent()

        rig.received.emit(ApiMessage(id = "m1", conversationId = "c1", senderId = "bob"))
        runCurrent()

        assertThat(rig.state.value.typers["c1"]).isNotNull()
    }

    @Test
    fun `the 15 second safety timeout is re-armed by every typing start`() = runTest(StandardTestDispatcher()) {
        val rig = rig()
        runCurrent()
        rig.started.emit(typing())
        runCurrent()

        advanceTimeBy(10_000)
        rig.started.emit(typing())
        runCurrent()
        advanceTimeBy(10_000)
        runCurrent()
        assertThat(rig.state.value.typers["c1"]).isNotNull()

        advanceTimeBy(5_001)
        runCurrent()
        assertThat(rig.state.value.typers).doesNotContainKey("c1")
    }
}

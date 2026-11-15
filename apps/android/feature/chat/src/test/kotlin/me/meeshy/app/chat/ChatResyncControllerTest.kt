package me.meeshy.app.chat

import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import org.junit.Test

class ChatResyncControllerTest {

    private class FakeHost(override val scope: CoroutineScope) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private class Rig(scope: TestScope) {
        val connected = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        val gaps = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        val repo: MessageRepository = mockk(relaxed = true)
        init {
            ChatResyncController(connected, gaps, repo).attach(FakeHost(scope.backgroundScope))
            scope.runCurrent()
        }
    }

    @Test
    fun `a reconnection rereads the conversation once`() = runTest {
        val rig = Rig(this)
        rig.connected.emit(Unit)
        advanceTimeBy(ChatResyncController.BURST_MS + 1)
        runCurrent()
        coVerify(exactly = 1) { rig.repo.refresh("c1") }
    }

    @Test
    fun `a connection and its sequence gap in one burst fuse into one reread`() = runTest {
        val rig = Rig(this)
        rig.connected.emit(Unit)
        rig.gaps.emit(Unit)
        advanceTimeBy(ChatResyncController.BURST_MS + 1)
        runCurrent()
        coVerify(exactly = 1) { rig.repo.refresh("c1") }
    }

    @Test
    fun `a failed reread does not stop the next one`() = runTest {
        val rig = Rig(this)
        coEvery { rig.repo.refresh("c1") } throws IllegalStateException("offline") andThen Unit
        rig.gaps.emit(Unit)
        advanceTimeBy(ChatResyncController.BURST_MS + 1)
        runCurrent()
        rig.connected.emit(Unit)
        advanceTimeBy(ChatResyncController.BURST_MS + 1)
        runCurrent()
        coVerify(exactly = 2) { rig.repo.refresh("c1") }
    }
}

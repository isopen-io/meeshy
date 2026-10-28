package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageAttachmentRemover
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.conversation.PieceRemoval
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatPieceControllerTest {

    private val me = MeeshyUser(id = "me", username = "atabeth")

    private fun photo(id: String, mine: List<String>? = null, blurred: Boolean? = null) =
        ApiMessageAttachment(id = id, mimeType = "image/jpeg", currentUserReactions = mine, isBlurred = blurred)

    private fun carrier(vararg pieces: ApiMessageAttachment, text: String = "", sender: String = "me") = LocalMessage(
        ApiMessage(id = "64b7f0a1c2d3e4f5a6b7c8d9", conversationId = "c1", senderId = sender, content = text, attachments = pieces.toList()),
        sendState = LocalSendState.SYNCED,
    )

    private val messageId = "64b7f0a1c2d3e4f5a6b7c8d9"

    private class FakeHost(
        override val scope: CoroutineScope,
        override val messages: StateFlow<List<LocalMessage>>,
        state: ChatUiState,
    ) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(state)
        override fun reportError(message: String?) = Unit
    }

    private class Rig(
        val controller: ChatPieceController,
        val remover: MessageAttachmentRemover,
        val realtime: ChatRealtimeController,
        val repo: MessageRepository,
        val workManager: WorkManager,
    )

    private fun TestScope.rig(
        loaded: List<LocalMessage>,
        state: ChatUiState = ChatUiState(conversationId = "c1"),
    ): Rig {
        val remover = mockk<MessageAttachmentRemover>()
        val realtime = mockk<ChatRealtimeController>()
        coEvery { realtime.toggleAttachmentReaction(any(), any(), any(), any()) } returns true
        val repo = mockk<MessageRepository>(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val controller = ChatPieceController(remover, realtime, repo, workManager, session)
        controller.attach(FakeHost(backgroundScope, MutableStateFlow(loaded), state))
        return Rig(controller, remover, realtime, repo, workManager)
    }

    @Test
    fun `reacting adds an emoji the reader has not posted and removes one they have`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b", mine = listOf("👍")))))

        r.controller.react(messageId, "a", "👍")
        r.controller.react(messageId, "b", "👍")
        runCurrent()

        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "a", "👍", true) }
        coVerify(exactly = 1) { r.realtime.toggleAttachmentReaction(messageId, "b", "👍", false) }
    }

    @Test
    fun `a protected piece, a reader who cannot write or an unknown piece is never reacted to`() = runTest {
        val blurred = rig(listOf(carrier(photo("a", blurred = true))))
        blurred.controller.react(messageId, "a", "👍")

        val readOnly = rig(
            listOf(carrier(photo("a"))),
            state = ChatUiState(conversationId = "c1", composerPermissions = null, encryptionMode = "e2ee"),
        )
        readOnly.controller.react(messageId, "a", "👍")

        val unknown = rig(listOf(carrier(photo("a"))))
        unknown.controller.react(messageId, "ghost", "👍")
        unknown.controller.react("nope", "a", "👍")
        runCurrent()

        coVerify(exactly = 0) { blurred.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        coVerify(exactly = 0) { readOnly.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
        coVerify(exactly = 0) { unknown.realtime.toggleAttachmentReaction(any(), any(), any(), any()) }
    }

    @Test
    fun `deleting one piece of several removes only that piece through the gateway`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        coEvery { r.remover.remove(messageId, "b") } returns PieceRemoval.REMOVED

        r.controller.delete(messageId, "b")
        runCurrent()

        coVerify(exactly = 1) { r.remover.remove(messageId, "b") }
        coVerify(exactly = 0) { r.repo.deleteOptimistic(any()) }
    }

    @Test
    fun `deleting the last piece of a message without text deletes the whole message`() = runTest {
        val r = rig(listOf(carrier(photo("a"))))
        coEvery { r.repo.deleteOptimistic(messageId) } returns true

        r.controller.delete(messageId, "a")
        runCurrent()

        coVerify(exactly = 1) { r.repo.deleteOptimistic(messageId) }
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
        coVerify(exactly = 0) { r.remover.remove(any(), any()) }
    }

    @Test
    fun `a refusal of the gateway is told to the reader, the piece came back`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"))))
        coEvery { r.remover.remove(messageId, "a") } returns PieceRemoval.FAILED
        val told = mutableListOf<PieceFailure>()
        backgroundScope.launch { r.controller.failures.collect { told += it } }
        runCurrent()

        r.controller.delete(messageId, "a")
        runCurrent()

        assertThat(told).containsExactly(PieceFailure.REMOVE)
    }

    @Test
    fun `a piece of someone else's message is never deleted`() = runTest {
        val r = rig(listOf(carrier(photo("a"), photo("b"), sender = "other")))

        r.controller.delete(messageId, "a")
        runCurrent()

        coVerify(exactly = 0) { r.remover.remove(any(), any()) }
        coVerify(exactly = 0) { r.repo.deleteOptimistic(any()) }
    }
}

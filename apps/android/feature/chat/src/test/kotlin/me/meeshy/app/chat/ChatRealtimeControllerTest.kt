package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
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
import me.meeshy.sdk.conversation.MessageDeltaApplier
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.AudioTranslationStage
import me.meeshy.sdk.model.ConversationJoinErrorEvent
import me.meeshy.sdk.model.ConversationSocketEvent
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageArrived
import me.meeshy.sdk.model.MessageCountdownStartedEvent
import me.meeshy.sdk.model.MessagePinChanged
import me.meeshy.sdk.model.MessageRestoredForMeEvent
import me.meeshy.sdk.model.PersonalMessageVisibilityRef
import me.meeshy.sdk.model.TranslatedAudioPayload
import me.meeshy.sdk.model.TranslationFailedEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.ConversationSocketEventsManager
import org.junit.Test

class ChatRealtimeControllerTest {

    private class FakeHost(
        override val scope: CoroutineScope,
        override val messages: MutableStateFlow<List<LocalMessage>> = MutableStateFlow(emptyList()),
    ) : ChatControllerHost {
        override val conversationId: String = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override fun reportError(message: String?) = Unit
    }

    private class Rig(scope: TestScope) {
        val events = MutableSharedFlow<ConversationSocketEvent>(extraBufferCapacity = 64)
        val socket: ConversationSocketEventsManager = mockk(relaxed = true) {
            every { this@mockk.events } returns this@Rig.events
        }
        val deltas: MessageDeltaApplier = mockk(relaxed = true)
        val repo: MessageRepository = mockk(relaxed = true)
        val session: SessionRepository = mockk {
            every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        }
        val host = FakeHost(scope.backgroundScope)
        val controller = ChatRealtimeController(socket, deltas, repo, session).also { it.attach(host) }
    }

    private fun ConversationSocketEvent.isDelta(rig: Rig, handled: Boolean) {
        coEvery { rig.deltas.apply(this@isDelta, any()) } returns handled
    }

    @Test
    fun `a local delta is applied to Room without any network refresh`() = runTest {
        val rig = Rig(this)
        val pin = MessagePinChanged("m1", "c1", pinned = true)
        pin.isDelta(rig, handled = true)
        runCurrent()

        rig.events.emit(pin)
        runCurrent()
        rig.controller.awaitPendingEvents()

        coVerify(exactly = 1) { rig.deltas.apply(pin, "me") }
        coVerify(exactly = 0) { rig.repo.refresh(any()) }
    }

    @Test
    fun `an event of another conversation is ignored`() = runTest {
        val rig = Rig(this)
        runCurrent()

        rig.events.emit(MessagePinChanged("m1", "other", pinned = true))
        runCurrent()

        coVerify(exactly = 0) { rig.deltas.apply(any(), any()) }
    }

    @Test
    fun `an enrichment waits for its message to land in Room`() = runTest {
        val rig = Rig(this)
        val arrived = MessageArrived("m9", "c1")
        val countdown = MessageCountdownStartedEvent("m9", "c1", "2026-10-24T10:00:30Z")
        arrived.isDelta(rig, handled = false)
        countdown.isDelta(rig, handled = true)
        runCurrent()

        rig.events.emit(arrived)
        rig.events.emit(countdown)
        runCurrent()
        coVerify(exactly = 0) { rig.deltas.apply(countdown, any()) }

        rig.host.messages.value = listOf(LocalMessage(ApiMessage(id = "m9", conversationId = "c1")))
        runCurrent()
        rig.controller.awaitPendingEvents()

        coVerifyOrder {
            rig.deltas.apply(arrived, "me")
            rig.deltas.apply(countdown, "me")
        }
    }

    @Test
    fun `a message that never lands stops blocking the lane after the wait`() = runTest {
        val rig = Rig(this)
        val arrived = MessageArrived("ghost", "c1")
        val pin = MessagePinChanged("m1", "c1", pinned = true)
        arrived.isDelta(rig, handled = false)
        pin.isDelta(rig, handled = true)
        runCurrent()

        rig.events.emit(arrived)
        rig.events.emit(pin)
        runCurrent()
        coVerify(exactly = 0) { rig.deltas.apply(pin, any()) }

        advanceTimeBy(ChatRealtimeController.ARRIVAL_WAIT_MS + 1)
        runCurrent()

        coVerify(exactly = 1) { rig.deltas.apply(pin, "me") }
    }

    @Test
    fun `a personal restore reloads the conversation since it carries no message`() = runTest {
        val rig = Rig(this)
        val restored = MessageRestoredForMeEvent(messages = listOf(PersonalMessageVisibilityRef("m1", "c1")))
        restored.isDelta(rig, handled = false)
        runCurrent()

        rig.events.emit(restored)
        runCurrent()

        coVerify(exactly = 1) { rig.repo.refresh("c1") }
    }

    @Test
    fun `a progressive audio translation lands like a ready one`() = runTest {
        val rig = Rig(this)
        val stage = AudioTranslationStage(
            AudioTranslationEvent(
                messageId = "m1", conversationId = "c1", attachmentId = "a1", language = "en",
                translatedAudio = TranslatedAudioPayload(url = "https://cdn/a.mp3", transcription = "hi"),
            ),
            completed = false,
        )
        stage.isDelta(rig, handled = false)
        runCurrent()

        rig.events.emit(stage)
        runCurrent()

        coVerify(exactly = 1) {
            rig.repo.applyAudioTranslation("m1", "a1", "en", "https://cdn/a.mp3", "hi", null, null, false, null, null, null)
        }
    }

    @Test
    fun `a failed translation and a lost membership surface in the controller state`() = runTest {
        val rig = Rig(this)
        val failed = TranslationFailedEvent("m1", "c1", "boom")
        val denied = ConversationJoinErrorEvent("c1", reason = "banned", message = "Vous avez été banni")
        val transient = ConversationJoinErrorEvent("c1", reason = "rate_limited", message = "Plus tard")
        listOf(failed, denied, transient).forEach { it.isDelta(rig, handled = false) }
        runCurrent()

        rig.events.emit(transient)
        runCurrent()
        assertThat(rig.controller.state.value.isAccessRevoked).isFalse()

        rig.events.emit(failed)
        rig.events.emit(denied)
        runCurrent()

        assertThat(rig.controller.state.value.failedTranslationMessageIds).containsExactly("m1")
        assertThat(rig.controller.state.value.accessRevokedReason).isEqualTo("Vous avez été banni")
    }

    @Test
    fun `an attachment reaction refused by the gateway is rolled back`() = runTest {
        val rig = Rig(this)
        coEvery { rig.deltas.toggleAttachmentReaction("m1", "a1", "❤️", any()) } returns true
        coEvery { rig.socket.emitAttachmentReaction("m1", "a1", "❤️", true) } returns false

        val accepted = rig.controller.toggleAttachmentReaction("m1", "a1", "❤️", adding = true)

        assertThat(accepted).isFalse()
        coVerifyOrder {
            rig.deltas.toggleAttachmentReaction("m1", "a1", "❤️", true)
            rig.socket.emitAttachmentReaction("m1", "a1", "❤️", true)
            rig.deltas.toggleAttachmentReaction("m1", "a1", "❤️", false)
        }
    }

    @Test
    fun `an accepted attachment reaction is kept`() = runTest {
        val rig = Rig(this)
        coEvery { rig.deltas.toggleAttachmentReaction("m1", "a1", "❤️", true) } returns true
        coEvery { rig.socket.emitAttachmentReaction("m1", "a1", "❤️", true) } returns true

        assertThat(rig.controller.toggleAttachmentReaction("m1", "a1", "❤️", adding = true)).isTrue()

        coVerify(exactly = 0) { rig.deltas.toggleAttachmentReaction("m1", "a1", "❤️", false) }
    }

    @Test
    fun `a reaction on an unsent bubble emits nothing`() = runTest {
        val rig = Rig(this)
        coEvery { rig.deltas.toggleAttachmentReaction(any(), any(), any(), any()) } returns false

        assertThat(rig.controller.toggleAttachmentReaction("cid_1", "a1", "❤️", adding = true)).isFalse()

        coVerify(exactly = 0) { rig.socket.emitAttachmentReaction(any(), any(), any(), any()) }
    }
}

package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.model.translation.TranslationRequestFailure
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatTranslationRequestsTest {

    private val viewer = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private fun message(encryptionMode: String? = null, isEncrypted: Boolean? = null) = LocalMessage(
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "Hello",
            originalLanguage = "en",
            encryptionMode = encryptionMode,
            isEncrypted = isEncrypted,
        ),
    )

    private class Rig(
        val controller: ChatTranslationController,
        val flow: MutableStateFlow<ChatUiState>,
        val repo: MessageRepository,
        val translationReceived: MutableSharedFlow<TranslationEvent>,
        val audioCalls: MutableList<Pair<String, String>>,
    )

    private fun TestScope.rig(
        conversationMode: String? = null,
        loaded: List<LocalMessage> = listOf(message()),
        audioResult: suspend () -> Boolean = { true },
    ): Rig {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1", encryptionMode = conversationMode))
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.requestTranslation(any(), any()) } returns true
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(viewer)
        val received = MutableSharedFlow<TranslationEvent>()
        val socket = mockk<MessageSocketManager>()
        every { socket.translationReceived } returns received
        every { socket.messageEdited } returns MutableSharedFlow()
        val audioCalls = mutableListOf<Pair<String, String>>()
        val controller = ChatTranslationController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            messages = MutableStateFlow(loaded),
            messageRepository = repo,
            sessionRepository = session,
            messageSocketManager = socket,
            conversationId = "c1",
            requestAttachmentTranslation = { attachment, language ->
                audioCalls += attachment to language
                audioResult()
            },
        )
        return Rig(controller, flow, repo, received, audioCalls)
    }

    @Test
    fun `an end-to-end conversation never sends clear text to server translation and says why on the row`() = runTest {
        val r = rig(conversationMode = "e2ee")

        r.controller.onExplorerRetranslate("m1", "de")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.requestTranslation(any(), any()) }
        val failure = r.controller.translationFailures.value["m1|de"]
        assertThat(failure?.reason).isEqualTo(TranslationRequestFailure.Reason.SERVER_REFUSED)
        assertThat(r.flow.value.translatingLanguages).isEmpty()
    }

    @Test
    fun `a conversation served without a mode that shows a sealed message is refused`() = runTest {
        val r = rig(conversationMode = null, loaded = listOf(message(isEncrypted = true)))

        r.controller.onExplorerRetranslate("m1", "de")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.requestTranslation(any(), any()) }
        assertThat(r.controller.translationFailures.value).containsKey("m1|de")
    }

    @Test
    fun `an unknown message in an end-to-end conversation is refused rather than sent`() = runTest {
        val r = rig(conversationMode = "e2ee", loaded = emptyList())

        r.controller.requestAudioTranslation("ghost", "a1", "de")
        advanceUntilIdle()

        assertThat(r.audioCalls).isEmpty()
        assertThat(r.controller.translationFailures.value["ghost|de"]?.kind)
            .isEqualTo(TranslationRequestFailure.Kind.AUDIO)
    }

    @Test
    fun `a request that returns nothing is published on the row and a retry clears it`() = runTest {
        val r = rig()
        coEvery { r.repo.requestTranslation("m1", "de") } returns false

        r.controller.onExplorerRetranslate("m1", "de")
        advanceUntilIdle()
        assertThat(r.controller.translationFailures.value["m1|de"]?.reason)
            .isEqualTo(TranslationRequestFailure.Reason.FAILED)

        coEvery { r.repo.requestTranslation("m1", "de") } returns true
        r.controller.onExplorerRetranslate("m1", "de")
        advanceUntilIdle()
        assertThat(r.controller.translationFailures.value).isEmpty()
    }

    @Test
    fun `the in-flight state survives the sheet closing`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.requestTranslation("m1", "de") } coAnswers { gate.await() }

        r.controller.openLanguageExplorer("m1")
        r.controller.onExplorerRetranslate("m1", "de")
        runCurrent()
        r.controller.dismissLanguageExplorer()
        runCurrent()

        assertThat(r.flow.value.translatingLanguages).containsExactly("m1|de")
        gate.complete(true)
        advanceUntilIdle()
        assertThat(r.flow.value.translatingLanguages).isEmpty()
    }

    @Test
    fun `an audio translation is requested per attachment and a refusal by the server is published`() = runTest {
        val r = rig(audioResult = { false })

        r.controller.requestAudioTranslation("m1", "a7", "de")
        advanceUntilIdle()

        assertThat(r.audioCalls).containsExactly("a7" to "de")
        assertThat(r.controller.translationFailures.value["m1|de"]?.kind)
            .isEqualTo(TranslationRequestFailure.Kind.AUDIO)
        assertThat(r.flow.value.translatingLanguages).isEmpty()
    }

    @Test
    fun `a translation frame received clears the failure of its row`() = runTest {
        val r = rig()
        coEvery { r.repo.requestTranslation("m1", "de") } returns false
        r.controller.start()
        r.controller.onExplorerRetranslate("m1", "de")
        advanceUntilIdle()
        assertThat(r.controller.translationFailures.value).isNotEmpty()

        r.translationReceived.emit(TranslationEvent("m1", "c1", "de", "Hallo"))
        advanceUntilIdle()

        assertThat(r.controller.translationFailures.value).isEmpty()
    }
}

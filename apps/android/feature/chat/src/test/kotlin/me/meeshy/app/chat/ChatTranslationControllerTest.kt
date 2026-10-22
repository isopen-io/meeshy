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
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatTranslationControllerTest {

    /** Reads fr, es and de: fr and es are translated, de is configured but has no content. */
    private val viewer = MeeshyUser(
        id = "me",
        username = "atabeth",
        systemLanguage = "fr",
        regionalLanguage = "es",
        customDestinationLanguage = "de",
    )

    private fun hello() = LocalMessage(
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "Hello",
            originalLanguage = "en",
            translations = listOf(
                ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"),
                ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
            ),
        ),
    )

    private class Rig(
        val controller: ChatTranslationController,
        val flow: MutableStateFlow<ChatUiState>,
        val messages: MutableStateFlow<List<LocalMessage>>,
        val repo: MessageRepository,
        val translationReceived: MutableSharedFlow<TranslationEvent>,
    ) {
        val state: ChatUiState get() = flow.value
        val overrides: Map<String, String> get() = controller.activeLanguageOverride.value
    }

    private fun TestScope.rig(
        initial: ChatUiState = ChatUiState(conversationId = "c1"),
        loaded: List<LocalMessage> = listOf(hello()),
        user: MeeshyUser? = viewer,
    ): Rig {
        val flow = MutableStateFlow(initial)
        val messages = MutableStateFlow(loaded)
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.requestTranslation(any(), any()) } returns true
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        val translationReceived = MutableSharedFlow<TranslationEvent>()
        val socket = mockk<MessageSocketManager>()
        every { socket.translationReceived } returns translationReceived
        val controller = ChatTranslationController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            messages = messages,
            messageRepository = repo,
            sessionRepository = session,
            messageSocketManager = socket,
            conversationId = "c1",
        )
        return Rig(controller, flow, messages, repo, translationReceived)
    }

    // --- flag taps ------------------------------------------------------------------------

    @Test
    fun `tapping a translated flag switches the bubble to it and tapping it again reverts`() = runTest {
        val r = rig()

        r.controller.onFlagTap("m1", "es")
        assertThat(r.overrides).containsExactly("m1", "es")

        r.controller.onFlagTap("m1", "es")
        assertThat(r.overrides).isEmpty()
    }

    @Test
    fun `tapping the original language shows the original and the preferred flag is inert while active`() = runTest {
        val r = rig()

        r.controller.onFlagTap("m1", "en")
        assertThat(r.overrides).containsExactly("m1", "en")

        r.controller.onFlagTap("m1", "en")
        r.controller.onFlagTap("m1", "fr")
        r.controller.onFlagTap("m1", "fr")
        assertThat(r.overrides).isEmpty()
        coVerify(exactly = 0) { r.repo.requestTranslation(any(), any()) }
    }

    @Test
    fun `a flag tap on a message that is not loaded is inert`() = runTest {
        val r = rig()

        r.controller.onFlagTap("ghost", "es")
        advanceUntilIdle()

        assertThat(r.overrides).isEmpty()
        coVerify(exactly = 0) { r.repo.requestTranslation(any(), any()) }
    }

    // --- on-demand translation ----------------------------------------------------------------

    @Test
    fun `tapping a language without content translates it on demand and switches to it`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.requestTranslation("m1", "de") } coAnswers { gate.await() }

        r.controller.onFlagTap("m1", "de")
        runCurrent()

        assertThat(r.state.translatingLanguages).containsExactly("m1|de")
        assertThat(r.overrides).isEmpty()

        gate.complete(true)
        advanceUntilIdle()

        assertThat(r.state.translatingLanguages).isEmpty()
        assertThat(r.overrides).containsExactly("m1", "de")
        coVerify(exactly = 1) { r.repo.requestTranslation("m1", "de") }
    }

    @Test
    fun `each language of a message keeps its own in-flight state`() = runTest {
        val r = rig()
        val german = CompletableDeferred<Boolean>()
        val french = CompletableDeferred<Boolean>()
        coEvery { r.repo.requestTranslation("m1", "de") } coAnswers { german.await() }
        coEvery { r.repo.requestTranslation("m1", "fr") } coAnswers { french.await() }

        r.controller.onFlagTap("m1", "de")
        r.controller.onExplorerRetranslate("m1", "fr")
        runCurrent()
        assertThat(r.state.translatingLanguages).containsExactly("m1|de", "m1|fr")

        german.complete(true)
        runCurrent()

        assertThat(r.state.translatingLanguages).containsExactly("m1|fr")
        assertThat(r.overrides).containsExactly("m1", "de")

        french.complete(false)
        advanceUntilIdle()
        assertThat(r.state.translatingLanguages).isEmpty()
    }

    @Test
    fun `a second tap while the language is in flight sends no duplicate request`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Boolean>()
        coEvery { r.repo.requestTranslation("m1", "de") } coAnswers { gate.await() }

        r.controller.onFlagTap("m1", "de")
        r.controller.onFlagTap("m1", "de")
        r.controller.onExplorerRetranslate("m1", "DE ")
        runCurrent()
        gate.complete(false)
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.requestTranslation("m1", "de") }
    }

    @Test
    fun `a translation the repository declined leaves the bubble where it was and frees the language`() = runTest {
        val r = rig()
        coEvery { r.repo.requestTranslation("m1", "de") } returns false

        r.controller.onFlagTap("m1", "de")
        advanceUntilIdle()

        assertThat(r.overrides).isEmpty()
        assertThat(r.state.translatingLanguages).isEmpty()
        assertThat(r.state.errorMessage).isNull()
    }

    @Test
    fun `a failed translation is surfaced and frees the language for another try`() = runTest {
        val r = rig()
        coEvery { r.repo.requestTranslation("m1", "de") } throws RuntimeException("boom")

        r.controller.onFlagTap("m1", "de")
        advanceUntilIdle()

        assertThat(r.state.errorMessage).isEqualTo("boom")
        assertThat(r.state.translatingLanguages).isEmpty()
        assertThat(r.overrides).isEmpty()

        coEvery { r.repo.requestTranslation("m1", "de") } returns true
        r.controller.onFlagTap("m1", "de")
        advanceUntilIdle()
        assertThat(r.overrides).containsExactly("m1", "de")
    }

    @Test
    fun `retranslating from the explorer needs a loaded message and a language code`() = runTest {
        val r = rig()

        r.controller.onExplorerRetranslate("ghost", "fr")
        r.controller.onExplorerRetranslate("m1", "   ")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.requestTranslation(any(), any()) }
    }

    @Test
    fun `retranslating a language that already has content still asks for a fresh translation`() = runTest {
        val r = rig()

        r.controller.onExplorerRetranslate("m1", "fr")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.requestTranslation("m1", "fr") }
    }

    // --- original toggle -------------------------------------------------------------------------

    @Test
    fun `the original toggle flips per message and closes the action sheet`() = runTest {
        val r = rig(ChatUiState(conversationId = "c1", actionMessageId = "m1"))

        r.controller.toggleShowOriginal("m1")
        assertThat(r.controller.showingOriginal.value).containsExactly("m1")
        assertThat(r.state.actionMessageId).isNull()

        r.controller.toggleShowOriginal("m2")
        assertThat(r.controller.showingOriginal.value).containsExactly("m1", "m2")

        r.controller.toggleShowOriginal("m1")
        assertThat(r.controller.showingOriginal.value).containsExactly("m2")
    }

    @Test
    fun `a flag tap reads the original toggle as the displayed language`() = runTest {
        val r = rig()
        r.controller.toggleShowOriginal("m1")

        r.controller.onFlagTap("m1", "en")

        // The original is what is displayed, so tapping its flag reverts instead of re-selecting it.
        assertThat(r.overrides).isEmpty()
    }

    // --- live translation frames -------------------------------------------------------------------

    @Test
    fun `a translation frame of this conversation is merged into the cache`() = runTest {
        val r = rig()
        r.controller.start()
        advanceUntilIdle()

        r.translationReceived.emit(
            TranslationEvent(messageId = "m1", conversationId = "c1", targetLanguage = "it", translatedContent = "Ciao"),
        )
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.applyTranslation("m1", "it", "Ciao") }
    }

    @Test
    fun `a translation frame of another conversation is ignored`() = runTest {
        val r = rig()
        r.controller.start()
        advanceUntilIdle()

        r.translationReceived.emit(
            TranslationEvent(messageId = "m1", conversationId = "elsewhere", targetLanguage = "it", translatedContent = "Ciao"),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.applyTranslation(any(), any(), any()) }
    }

    // --- language explorer -------------------------------------------------------------------------

    @Test
    fun `opening the explorer targets the message, closes the action sheet and projects it live`() = runTest {
        val r = rig(ChatUiState(conversationId = "c1", actionMessageId = "m1"))
        r.controller.start()
        advanceUntilIdle()

        r.controller.openLanguageExplorer("m1")
        advanceUntilIdle()

        assertThat(r.state.explorerMessageId).isEqualTo("m1")
        assertThat(r.state.actionMessageId).isNull()
        assertThat(r.state.languageExplorer).isNotNull()
    }

    @Test
    fun `the explorer follows the bubble's active language and closes with the message`() = runTest {
        val r = rig()
        r.controller.start()
        r.controller.openLanguageExplorer("m1")
        advanceUntilIdle()
        val before = r.state.languageExplorer

        r.controller.onFlagTap("m1", "es")
        advanceUntilIdle()
        val after = r.state.languageExplorer
        assertThat(after).isNotEqualTo(before)

        r.messages.value = emptyList()
        advanceUntilIdle()
        assertThat(r.state.languageExplorer).isNull()
    }

    @Test
    fun `dismissing the explorer clears its target and its projection`() = runTest {
        val r = rig()
        r.controller.start()
        r.controller.openLanguageExplorer("m1")
        advanceUntilIdle()

        r.controller.dismissLanguageExplorer()
        advanceUntilIdle()

        assertThat(r.state.explorerMessageId).isNull()
        assertThat(r.state.languageExplorer).isNull()
    }
}

package me.meeshy.app.chat

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatComposerControllerTest {

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private class Rig(
        val controller: ChatComposerController,
        val flow: MutableStateFlow<ChatUiState>,
        val messages: MutableStateFlow<List<LocalMessage>>,
        val repo: MessageRepository,
        val socket: MessageSocketManager,
        val workManager: WorkManager,
        val drafts: InMemoryConversationDraftStore,
        val uploads: MediaUploadQueue,
        val holder: ComposerTextHolder,
    ) {
        val state: ChatUiState get() = flow.value
        val text: ComposerTextState get() = holder.state
    }

    private fun TestScope.rig(
        initial: ChatUiState = ChatUiState(conversationId = "c1"),
        initialText: String = "",
        loaded: List<LocalMessage> = emptyList(),
        user: MeeshyUser? = me,
        drafts: Map<String, ConversationDraft> = emptyMap(),
    ): Rig {
        val flow = MutableStateFlow(initial)
        val messages = MutableStateFlow(loaded)
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        coEvery { repo.editOptimistic(any(), any()) } returns true
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(user)
        val socket = mockk<MessageSocketManager>()
        justRun { socket.emitTypingStart(any()) }
        justRun { socket.emitTypingStop(any()) }
        val workManager = mockk<WorkManager>(relaxed = true)
        val draftStore = InMemoryConversationDraftStore(drafts)
        val uploads = mockk<MediaUploadQueue>(relaxed = true)
        coEvery { uploads.enqueue(any()) } returns "upload-cmid"
        val clock = object : CacheClock {
            override fun nowMillis(): Long = NOW
        }
        val holder = ComposerTextHolder(initialText)
        val controller = ChatComposerController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            conversationId = "c1",
            messages = messages,
            messageRepository = repo,
            sessionRepository = session,
            draftStore = draftStore,
            mediaUploadQueue = uploads,
            mentionSearch = mockk<MentionSearch>(relaxed = true),
            anonymousSessionStore = InMemoryAnonymousSessionStore(null),
            messageSocketManager = socket,
            workManager = workManager,
            clock = clock,
            composerText = holder,
        )
        return Rig(controller, flow, messages, repo, socket, workManager, draftStore, uploads, holder)
    }

    // --- sending -------------------------------------------------------------------------------

    @Test
    fun `a send posts the trimmed draft, clears the composer and queues the flush`() = runTest {
        val r = rig()
        r.controller.onDraftChange("  bonjour  ")

        r.controller.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c1", "bonjour", any(), me, null) }
        assertThat(r.text.text).isEmpty()
        assertThat(r.text.revision).isEqualTo(1)
        assertThat(r.state.lastSelfSentAtMillis).isEqualTo(NOW)
        verify(exactly = 1) { r.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun `a blank draft and a signed-out viewer send nothing`() = runTest {
        val blank = rig()
        blank.controller.onDraftChange("   ")
        blank.controller.send()

        val signedOut = rig(user = null)
        signedOut.controller.onDraftChange("hello")
        signedOut.controller.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { blank.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { signedOut.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        assertThat(signedOut.text.text).isEqualTo("hello")
    }

    @Test
    fun `a running slow-mode cooldown refuses the send and keeps the draft`() = runTest {
        val r = rig(
            ChatUiState(conversationId = "c1", slowModeSeconds = 30, lastSelfSentAtMillis = NOW - 1_000L),
        )
        r.controller.onDraftChange("too soon")

        r.controller.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        assertThat(r.text.text).isEqualTo("too soon")
    }

    @Test
    fun `a failing repository surfaces the error and the draft is already cleared`() = runTest {
        val r = rig()
        coEvery { r.repo.sendOptimistic(any(), any(), any(), any(), any()) } throws RuntimeException("disk full")
        r.controller.onDraftChange("hello")

        r.controller.send()
        advanceUntilIdle()

        assertThat(r.state.errorMessage).isEqualTo("disk full")
        assertThat(r.text.text).isEmpty()
    }

    @Test
    fun `a picked file is queued for upload and sent as a typed message with the draft as its body`() = runTest {
        val r = rig()
        r.controller.onDraftChange("look")

        r.controller.sendFileAttachment(byteArrayOf(1, 2, 3), " photo.png ", "image/png")
        advanceUntilIdle()

        coVerify(exactly = 1) { r.uploads.enqueue(match<MediaUploadItem> { it.fileName == "photo.png" && it.mimeType == "image/png" }) }
        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                "c1", "look", any(), me, null, null, null, null, any(), "image", listOf("upload-cmid"), any(),
            )
        }
        assertThat(r.text.text).isEmpty()
        assertThat(r.state.lastSelfSentAtMillis).isEqualTo(NOW)
    }

    // --- reply and edit ------------------------------------------------------------------------

    @Test
    fun `replying arms the target and the next send carries it`() = runTest {
        val r = rig(loaded = listOf(LocalMessage(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "yo"))))

        r.controller.startReply("m1")
        assertThat(r.state.replyingToMessageId).isEqualTo("m1")
        r.controller.onDraftChange("yes")
        r.controller.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.sendOptimistic("c1", "yes", any(), me, "m1") }
        assertThat(r.state.replyingToMessageId).isNull()
    }

    @Test
    fun `a reply to a message that is not loaded is inert, and cancelling disarms it`() = runTest {
        val r = rig(loaded = listOf(LocalMessage(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "yo"))))

        r.controller.startReply("ghost")
        assertThat(r.state.replyingToMessageId).isNull()

        r.controller.startReply("m1")
        r.controller.cancelReply()
        assertThat(r.state.replyingToMessageId).isNull()
    }

    @Test
    fun `editing a recent own message loads it into the composer and the send applies the edit`() = runTest {
        val own = LocalMessage(
            ApiMessage(
                id = "m1",
                conversationId = "c1",
                senderId = "me",
                content = "typo",
                createdAt = java.time.Instant.ofEpochMilli(NOW - 60_000L).toString(),
            ),
        )
        val r = rig(loaded = listOf(own))

        r.controller.startEdit("m1")
        assertThat(r.state.editingMessageId).isEqualTo("m1")
        assertThat(r.text.text).isEqualTo("typo")

        r.controller.onDraftChange("fixed")
        r.controller.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.repo.editOptimistic("m1", "fixed") }
        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        assertThat(r.state.editingMessageId).isNull()
        assertThat(r.text.text).isEmpty()
    }

    @Test
    fun `someone else's message cannot be edited`() = runTest {
        val theirs = LocalMessage(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "yo"))
        val r = rig(loaded = listOf(theirs))

        r.controller.startEdit("m1")

        assertThat(r.state.editingMessageId).isNull()
        assertThat(r.text.text).isEmpty()
    }

    // --- drafts ----------------------------------------------------------------------------------

    @Test
    fun `typing auto-saves the draft and emptying the composer purges it`() = runTest {
        val r = rig()

        r.controller.onDraftChange("half a sentence")
        advanceTimeBy(100)
        assertThat(r.drafts.load("c1")?.text).isEqualTo("half a sentence")

        r.controller.onDraftChange("")
        advanceTimeBy(100)
        assertThat(r.drafts.load("c1")).isNull()
        r.controller.release()
    }

    @Test
    fun `the stored draft is restored into an idle composer`() = runTest {
        val r = rig(drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "unsent", replyToId = "m9")))

        r.controller.restoreStoredDraft()

        assertThat(r.text.text).isEqualTo("unsent")
        assertThat(r.state.replyingToMessageId).isEqualTo("m9")
        assertThat(r.text.revision).isEqualTo(1)
    }

    @Test
    fun `a stored draft never overwrites what the viewer is already typing`() = runTest {
        val r = rig(
            initialText = "from a quick reply",
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "unsent")),
        )

        r.controller.restoreStoredDraft()

        assertThat(r.text.text).isEqualTo("from a quick reply")
    }

    // --- typing emission ---------------------------------------------------------------------------

    @Test
    fun `the first keystroke announces typing once and silence ends it`() = runTest {
        val r = rig()

        r.controller.onDraftChange("h")
        r.controller.onDraftChange("he")
        verify(exactly = 1) { r.socket.emitTypingStart("c1") }

        advanceTimeBy(3_100)
        verify(exactly = 1) { r.socket.emitTypingStop("c1") }
    }

    @Test
    fun `tearing the screen down ends a typing emission that is still running`() = runTest {
        val r = rig()
        r.controller.onDraftChange("h")

        r.controller.release()
        r.controller.release()

        verify(exactly = 1) { r.socket.emitTypingStop("c1") }
    }

    private companion object {
        const val NOW = 1_700_000_000_000L
    }
}

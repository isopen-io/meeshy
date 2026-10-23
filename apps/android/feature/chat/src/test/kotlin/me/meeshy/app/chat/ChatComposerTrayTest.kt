package me.meeshy.app.chat

import android.net.Uri
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.composer.AttachmentIngesting
import me.meeshy.sdk.composer.AttachmentSourceInfo
import me.meeshy.sdk.composer.AttachmentThumbnail
import me.meeshy.sdk.composer.IngestedFile
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ChatComposerTrayTest {

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private class Ingestor : AttachmentIngesting {
        var gate: CompletableDeferred<Unit> = CompletableDeferred<Unit>().apply { complete(Unit) }
        var thumbnail: AttachmentThumbnail? = null
        override suspend fun describe(uri: Uri) = AttachmentSourceInfo("x", "image/jpeg", 1L)
        override suspend fun ingest(uri: Uri, id: String, info: AttachmentSourceInfo): IngestedFile? = null
        override suspend fun ingestBytes(bytes: ByteArray, id: String, fileName: String?, mimeType: String): IngestedFile? {
            gate.await()
            return IngestedFile("/work/$id", bytes.size.toLong(), thumbnail)
        }
        override suspend fun readBytes(path: String): ByteArray? = "bytes-of-$path".toByteArray()
        override suspend fun delete(paths: Collection<String>) = Unit
    }

    private class Host(scope: kotlinx.coroutines.CoroutineScope) : ChatControllerHost {
        override val scope = scope
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1"))
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private class Rig(
        val composer: ChatComposerController,
        val tray: ComposerTrayController,
        val ingestor: Ingestor,
        val repo: MessageRepository,
        val uploads: MediaUploadQueue,
        val flow: MutableStateFlow<ChatUiState>,
    )

    private fun TestScope.rig(open: Boolean = true): Rig {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1"))
        val repo = mockk<MessageRepository>(relaxed = true)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        val session = mockk<SessionRepository>()
        every { session.currentUser } returns MutableStateFlow(me)
        val socket = mockk<MessageSocketManager>()
        justRun { socket.emitTypingStart(any()) }
        justRun { socket.emitTypingStop(any()) }
        val uploads = mockk<MediaUploadQueue>(relaxed = true)
        var count = 0
        coEvery { uploads.enqueue(any()) } answers { "upload-${count++}" }
        val ingestor = Ingestor().also { if (!open) it.gate = CompletableDeferred() }
        val tray = ComposerTrayController(RuntimeEnvironment.getApplication(), ingestor)
        tray.attach(Host(this))
        val composer = ChatComposerController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            conversationId = "c1",
            messages = MutableStateFlow(emptyList()),
            messageRepository = repo,
            sessionRepository = session,
            draftStore = InMemoryConversationDraftStore(emptyMap()),
            mediaUploadQueue = uploads,
            mentionSearch = mockk<MentionSearch>(relaxed = true),
            anonymousSessionStore = InMemoryAnonymousSessionStore(null),
            messageSocketManager = socket,
            workManager = mockk<WorkManager>(relaxed = true),
            clock = object : CacheClock {
                override fun nowMillis(): Long = 1_700_000_000_000L
            },
            pendingTray = { tray },
        )
        return Rig(composer, tray, ingestor, repo, uploads, flow)
    }

    @Test
    fun `picking sends nothing until the send button`() = runTest {
        val r = rig()

        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        r.tray.stageBytes(byteArrayOf(2), "b.jpg", "image/jpeg")
        advanceUntilIdle()

        coVerify(exactly = 0) { r.uploads.enqueue(any()) }
        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        assertThat(r.tray.state.value.items).hasSize(2)
    }

    @Test
    fun `send consumes the tray into one message carrying every piece and the draft`() = runTest {
        val r = rig()
        r.composer.onDraftChange("regardez")
        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        r.tray.stageBytes(byteArrayOf(2), "b.jpg", "image/jpeg")
        advanceUntilIdle()

        r.composer.send()
        advanceUntilIdle()

        val items = mutableListOf<MediaUploadItem>()
        coVerify(exactly = 2) { r.uploads.enqueue(capture(items)) }
        assertThat(items.map { it.fileName }).containsExactly("a.jpg", "b.jpg").inOrder()
        val attachments = slot<List<ApiMessageAttachment>>()
        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                conversationId = "c1",
                content = "regardez",
                originalLanguage = any(),
                sender = me,
                replyToId = any(),
                effects = any(),
                messageType = "image",
                attachmentUploadCmids = listOf("upload-0", "upload-1"),
                attachments = capture(attachments),
            )
        }
        assertThat(attachments.captured.map { it.id }).containsExactly("upload-0", "upload-1").inOrder()
        assertThat(r.tray.state.value.items).isEmpty()
    }

    @Test
    fun `a staged voice note leaves with its duration so the optimistic bubble shows it`() = runTest {
        val r = rig()
        r.ingestor.thumbnail = AttachmentThumbnail(durationMs = 4_200L)
        r.tray.stageBytes(byteArrayOf(1, 2), "voice_1.m4a", "audio/mp4")
        advanceUntilIdle()

        r.composer.send()
        advanceUntilIdle()

        val attachments = slot<List<ApiMessageAttachment>>()
        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                conversationId = "c1",
                content = any(),
                originalLanguage = any(),
                sender = me,
                replyToId = any(),
                effects = any(),
                messageType = "audio",
                attachmentUploadCmids = any(),
                attachments = capture(attachments),
            )
        }
        assertThat(attachments.captured.single().duration).isEqualTo(4_200)
    }

    @Test
    fun `a staged photo leaves with its dimensions`() = runTest {
        val r = rig()
        r.ingestor.thumbnail = AttachmentThumbnail(width = 1024, height = 768)
        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        advanceUntilIdle()

        r.composer.send()
        advanceUntilIdle()

        val attachments = slot<List<ApiMessageAttachment>>()
        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                conversationId = "c1",
                content = any(),
                originalLanguage = any(),
                sender = me,
                replyToId = any(),
                effects = any(),
                messageType = "image",
                attachmentUploadCmids = any(),
                attachments = capture(attachments),
            )
        }
        assertThat(attachments.captured.single().width).isEqualTo(1024)
        assertThat(attachments.captured.single().height).isEqualTo(768)
    }

    @Test
    fun `a tray without any text still sends`() = runTest {
        val r = rig()
        r.tray.stageBytes(byteArrayOf(1), "a.pdf", "application/pdf")
        advanceUntilIdle()

        r.composer.send()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                conversationId = "c1",
                content = "",
                originalLanguage = any(),
                sender = me,
                replyToId = any(),
                effects = any(),
                messageType = "file",
                attachmentUploadCmids = listOf("upload-0"),
                attachments = any(),
            )
        }
    }

    @Test
    fun `mixed pieces travel as a generic file message`() = runTest {
        val r = rig()
        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        r.tray.stageBytes(byteArrayOf(2), "b.pdf", "application/pdf")
        advanceUntilIdle()

        r.composer.send()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            r.repo.sendOptimistic(
                conversationId = "c1",
                content = any(),
                originalLanguage = any(),
                sender = me,
                replyToId = any(),
                effects = any(),
                messageType = "file",
                attachmentUploadCmids = any(),
                attachments = any(),
            )
        }
    }

    @Test
    fun `send waits while a piece is still preparing`() = runTest {
        val r = rig(open = false)
        r.tray.stageBytes(byteArrayOf(1), "a.jpg", "image/jpeg")
        advanceUntilIdle()

        r.composer.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { r.uploads.enqueue(any()) }
        assertThat(r.tray.state.value.items).hasSize(1)

        r.ingestor.gate.complete(Unit)
        advanceUntilIdle()
        r.composer.send()
        advanceUntilIdle()

        coVerify(exactly = 1) { r.uploads.enqueue(any()) }
    }

    @Test
    fun `an empty composer with an empty tray sends nothing`() = runTest {
        val r = rig()

        r.composer.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { r.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }
}

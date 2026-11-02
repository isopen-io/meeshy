package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.net.MeeshyConfig
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatFileDownloadControllerTest {

    private fun attachment(id: String, mime: String, url: String? = "https://cdn/$id", name: String = "$id.bin") =
        ApiMessageAttachment(id = id, fileName = name, originalName = name, mimeType = mime, fileUrl = url)

    private fun message(vararg attachments: ApiMessageAttachment) = LocalMessage(
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "",
            attachments = attachments.toList(),
        ),
    )

    private class Rig(
        val controller: ChatFileDownloadController,
        val flow: MutableStateFlow<ChatUiState>,
        val downloader: FileAttachmentDownloader,
    ) {
        val download: FileAttachmentDownloadUiState? get() = flow.value.fileDownload
    }

    private fun TestScope.rig(loaded: List<LocalMessage>, encryptionMode: String? = null): Rig {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1", encryptionMode = encryptionMode))
        val downloader = mockk<FileAttachmentDownloader>()
        every { downloader.download(any(), any(), any()) } returns emptyFlow()
        every { downloader.save(any(), any(), any()) } returns emptyFlow()
        val controller = ChatFileDownloadController(
            scope = screenScope(),
            state = ChatStateAccess(flow),
            messages = MutableStateFlow(loaded),
            downloader = downloader,
            config = MeeshyConfig(),
        )
        return Rig(controller, flow, downloader)
    }

    @Test
    fun `a message without a downloadable file fails as not available`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf", url = null))))

        r.controller.open("m1", attachmentId = null)

        val failed = r.download?.state as FileAttachmentDownloadState.Failed
        assertThat(failed.reason).isEqualTo(FileAttachmentDownloadFailure.NotAvailable)
        assertThat(r.download?.openWhenDone).isTrue()
    }

    @Test
    fun `an unknown message or attachment fails as not available too`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))

        r.controller.share("ghost", attachmentId = null)
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason)
            .isEqualTo(FileAttachmentDownloadFailure.NotAvailable)
        assertThat(r.download?.openWhenDone).isFalse()

        r.controller.open("m1", attachmentId = "nope")
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason)
            .isEqualTo(FileAttachmentDownloadFailure.NotAvailable)
    }

    @Test
    fun `without a named row the first file is chosen over images, audio and locations`() = runTest {
        val r = rig(
            listOf(
                message(
                    attachment("img", "image/png"),
                    attachment("snd", "audio/mpeg"),
                    attachment("loc", "application/x-location"),
                    attachment("doc", "application/pdf", name = "report.pdf"),
                ),
            ),
        )

        r.controller.open("m1", attachmentId = null)

        assertThat(r.download?.attachmentId).isEqualTo("doc")
        assertThat(r.download?.fileName).isEqualTo("report.pdf")
        assertThat(r.download?.state).isEqualTo(FileAttachmentDownloadState.InProgress(progressPercent = null))
    }

    @Test
    fun `the tapped row wins over the first file`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"), attachment("a2", "text/plain"))))

        r.controller.open("m1", attachmentId = "a2")

        assertThat(r.download?.attachmentId).isEqualTo("a2")
    }

    @Test
    fun `progress and completion stream into the state, and a finished file is served from memory the next time`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))
        val done = FileAttachmentDownloadState.Completed(localUri = "content://dl/1", mimeType = "application/pdf")
        every { r.downloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.InProgress(progressPercent = 40),
            done,
        )

        r.controller.open("m1", attachmentId = null)
        advanceUntilIdle()
        assertThat(r.download?.state).isEqualTo(done)

        r.controller.dismiss()
        assertThat(r.download).isNull()

        r.controller.share("m1", attachmentId = "a1")
        assertThat(r.download?.state).isEqualTo(done)
        assertThat(r.download?.openWhenDone).isFalse()
        verify(exactly = 1) { r.downloader.download(any(), any(), any()) }
    }

    @Test
    fun `dismissing a download clears the overlay`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))
        r.controller.open("m1", attachmentId = null)

        r.controller.dismiss()

        assertThat(r.download).isNull()
    }

    @Test
    fun `a view-once file never leaves Meeshy, neither to open nor to share, and nothing is downloaded`() = runTest {
        val protectedPiece = ApiMessageAttachment(
            id = "a1", fileName = "secret.pdf", originalName = "secret.pdf", mimeType = "application/pdf",
            fileUrl = "https://cdn/a1", isViewOnce = true,
        )
        val r = rig(listOf(message(protectedPiece)))

        r.controller.open("m1", attachmentId = "a1")
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason)
            .isEqualTo(FileAttachmentDownloadFailure.Protected)

        r.controller.share("m1", attachmentId = "a1")
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason)
            .isEqualTo(FileAttachmentDownloadFailure.Protected)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
    }

    @Test
    fun `a finished download is remembered as ready for the row badge`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))
        every { r.downloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.Completed(localUri = "content://dl/1", mimeType = "application/pdf"),
        )

        r.controller.open("m1", attachmentId = "a1")
        advanceUntilIdle()

        assertThat(r.controller.downloadedIds.value).containsExactly("a1")
    }

    @Test
    fun `a tap on the row whose download is running cancels it, a tap elsewhere starts its own`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"), attachment("a2", "text/plain"))))
        r.controller.tap("m1", attachmentId = "a1")
        assertThat(r.download?.attachmentId).isEqualTo("a1")

        r.controller.tap("m1", attachmentId = "a2")
        assertThat(r.download?.attachmentId).isEqualTo("a2")

        r.controller.tap("m1", attachmentId = "a2")
        assertThat(r.download).isNull()
    }

    @Test
    fun `a tap on a failed row retries instead of dismissing`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))
        every { r.downloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NetworkError),
        )
        r.controller.tap("m1", attachmentId = "a1")
        advanceUntilIdle()
        assertThat(r.download?.state).isInstanceOf(FileAttachmentDownloadState.Failed::class.java)

        every { r.downloader.download(any(), any(), any()) } returns emptyFlow()
        r.controller.tap("m1", attachmentId = "a1")

        assertThat(r.download?.state).isEqualTo(FileAttachmentDownloadState.InProgress(progressPercent = null))
    }

    @Test
    fun `saving a piece downloads it without opening or sharing it`() = runTest {
        val r = rig(listOf(message(attachment("v1", "video/mp4", name = "clip.mp4"))))

        r.controller.save("m1", attachmentId = "v1")

        assertThat(r.download?.saveOnly).isTrue()
        assertThat(r.download?.openWhenDone).isFalse()
        assertThat(r.download?.fileName).isEqualTo("clip.mp4")
    }

    @Test
    fun `saving a protected piece is refused and nothing is downloaded`() = runTest {
        val blurred = ApiMessageAttachment(
            id = "p1", fileName = "p.png", originalName = "p.png", mimeType = "image/png", fileUrl = "https://cdn/p1", isBlurred = true,
        )
        val r = rig(listOf(message(blurred)))

        r.controller.save("m1", attachmentId = "p1")

        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.Protected)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
    }

    @Test
    fun `an end-to-end blob is never downloaded, by tap nor by save`() = runTest {
        val blob = ApiMessageAttachment(
            id = "b1", fileName = "e2ee.bin", mimeType = "application/octet-stream", fileUrl = "https://cdn/b1",
            isEncrypted = true, encryptionMode = "e2ee",
        )
        val r = rig(listOf(message(blob)))

        r.controller.tap("m1", attachmentId = "b1")
        r.controller.save("m1", attachmentId = "b1")

        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.Protected)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
        verify(exactly = 0) { r.downloader.save(any(), any(), any()) }
    }

    private fun refusedEverywhere(r: Rig, attachmentId: String?) {
        r.controller.open("m1", attachmentId)
        r.controller.tap("m1", attachmentId)
        r.controller.share("m1", attachmentId)
        r.controller.save("m1", attachmentId)
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.Protected)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
        verify(exactly = 0) { r.downloader.save(any(), any(), any()) }
    }

    @Test
    fun `a piece marked encrypted is sealed even without the e2ee mode, by every path`() = runTest {
        val sealed = ApiMessageAttachment(id = "s1", fileName = "s.pdf", mimeType = "application/pdf", fileUrl = "https://cdn/s1", isEncrypted = true)
        refusedEverywhere(rig(listOf(message(sealed))), "s1")
    }

    @Test
    fun `a sealed message keeps its ordinary-looking piece, by every path`() = runTest {
        val m = LocalMessage(
            ApiMessage(
                id = "m1", conversationId = "c1", senderId = "o", content = "[Encrypted]", isEncrypted = true, encryptionMode = "e2ee",
                attachments = listOf(attachment("a1", "application/pdf")),
            ),
        )
        refusedEverywhere(rig(listOf(m)), null)
    }

    @Test
    fun `in an end-to-end conversation a piece whose information is missing is refused, never reported as merely unavailable`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))), encryptionMode = "e2ee")

        r.controller.open("ghost", attachmentId = "a1")
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.Protected)
        r.controller.openProvided("ghost", attachment("h1", "application/pdf"))
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.Protected)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
    }

    @Test
    fun `a sealed hub piece is refused too`() = runTest {
        val r = rig(emptyList())
        r.controller.openProvided("m9", ApiMessageAttachment(id = "h1", fileName = "h.pdf", mimeType = "application/pdf", fileUrl = "https://cdn/h1", isEncrypted = true))
        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.Protected)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
    }

    @Test
    fun `saving goes through the saver, never the cache downloader, and a file opened earlier is not a saved file`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf", name = "contrat.pdf"))))
        val opened = FileAttachmentDownloadState.Completed(localUri = "content://dl/cache", mimeType = "application/pdf")
        val saved = FileAttachmentDownloadState.Completed(localUri = "content://media/downloads/7", mimeType = "application/pdf")
        every { r.downloader.download(any(), any(), any()) } returns flowOf(opened)
        every { r.downloader.save(any(), any(), any()) } returns flowOf(saved)
        r.controller.open("m1", "a1")
        advanceUntilIdle()

        r.controller.save("m1", "a1")
        advanceUntilIdle()

        assertThat(r.download?.state).isEqualTo(saved)
        verify(exactly = 1) { r.downloader.save("https://cdn/a1", "contrat.pdf", "application/pdf") }
        r.controller.save("m1", "a1")
        verify(exactly = 1) { r.downloader.save(any(), any(), any()) }
        assertThat(r.controller.downloadedIds.value).containsExactly("a1")
    }

    @Test
    fun `a save that fails is reported as failed, not as saved`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))
        every { r.downloader.save(any(), any(), any()) } returns flowOf(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.SaveFailed))

        r.controller.save("m1", "a1")
        advanceUntilIdle()

        assertThat(r.download?.state).isEqualTo(FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.SaveFailed))
        assertThat(r.controller.downloadedIds.value).isEmpty()
    }

    @Test
    fun `retrying a failed save saves again, never hands the piece to a share sheet nor opens it`() = runTest {
        val r = rig(listOf(message(attachment("v1", "video/mp4", name = "clip.mp4"))))
        every { r.downloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NetworkError),
        )
        r.controller.save("m1", attachmentId = "v1")
        advanceUntilIdle()

        r.controller.retry()

        assertThat(r.download?.saveOnly).isTrue()
        assertThat(r.download?.openWhenDone).isFalse()
        assertThat(r.download?.attachmentId).isEqualTo("v1")
    }

    @Test
    fun `retrying a failed open opens again, and a failed share shares again`() = runTest {
        val r = rig(listOf(message(attachment("a1", "application/pdf"))))
        every { r.downloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.ServerError),
        )
        r.controller.open("m1", attachmentId = "a1")
        advanceUntilIdle()
        r.controller.retry()
        assertThat(r.download?.openWhenDone).isTrue()
        assertThat(r.download?.saveOnly).isFalse()

        r.controller.share("m1", attachmentId = "a1")
        advanceUntilIdle()
        r.controller.retry()
        assertThat(r.download?.openWhenDone).isFalse()
        assertThat(r.download?.saveOnly).isFalse()
    }
}

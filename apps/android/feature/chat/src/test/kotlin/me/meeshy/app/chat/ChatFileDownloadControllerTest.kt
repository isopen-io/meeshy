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

    private fun TestScope.rig(loaded: List<LocalMessage>): Rig {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1"))
        val downloader = mockk<FileAttachmentDownloader>()
        every { downloader.download(any(), any(), any()) } returns emptyFlow()
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

        assertThat((r.download?.state as FileAttachmentDownloadState.Failed).reason).isEqualTo(FileAttachmentDownloadFailure.NotAvailable)
        verify(exactly = 0) { r.downloader.download(any(), any(), any()) }
    }
}

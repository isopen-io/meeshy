package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.MediaUploadPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test

class MediaSendersTest {

    private val mediaBlobStore = mockk<MediaBlobStore>(relaxed = true)
    private val mediaRepository = mockk<MediaRepository>()
    private val tusUploadRepository = mockk<TusUploadRepository>()

    private val item = MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = "photo.jpg", mimeType = "image/jpeg")
    private val uploaded = UploadedMedia(
        id = "media-9",
        url = "https://cdn/x.jpg",
        mimeType = "image/jpeg",
        fileSize = 3L,
        width = null,
        height = null,
        durationMs = null,
        thumbnailUrl = null,
    )

    private fun handler() = UploadMediaHandler(mediaBlobStore, mediaRepository, tusUploadRepository, senderJson)

    private fun row(payload: String = "") =
        outboxRow(OutboxKind.UPLOAD_MEDIA, targetId = "cmid-1", payload = payload)

    @Test
    fun `a legacy upload with a blank payload goes through the attachment upload and yields the real id`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1") } returns item
        coEvery { mediaRepository.upload(listOf(item)) } returns NetworkResult.Success(listOf(uploaded))

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.SuccessWithId("media-9"))
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `an upload tagged with a known context goes through the resumable upload`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1") } returns item
        coEvery { tusUploadRepository.upload(item, TusUploadContext.STORY) } returns
            NetworkResult.Success(listOf(uploaded))

        val result = handler().send(row(encodedPayload(MediaUploadPayload(uploadContext = "story"))))

        assertThat(result).isEqualTo(SendResult.SuccessWithId("media-9"))
        coVerify(exactly = 0) { mediaRepository.upload(any()) }
    }

    @Test
    fun `an unrecognised or malformed context falls back to the legacy upload instead of failing`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1") } returns item
        coEvery { mediaRepository.upload(listOf(item)) } returns NetworkResult.Success(listOf(uploaded))

        val unknown = handler().send(row(encodedPayload(MediaUploadPayload(uploadContext = "from-the-future"))))
        val malformed = handler().send(row("{not json"))

        assertThat(unknown).isEqualTo(SendResult.SuccessWithId("media-9"))
        assertThat(malformed).isEqualTo(SendResult.SuccessWithId("media-9"))
    }

    @Test
    fun `a transient upload failure keeps the bytes for the retry`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1") } returns item
        coEvery { mediaRepository.upload(listOf(item)) } returns NetworkResult.Failure(ApiError("offline"))

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { mediaBlobStore.remove(any()) }
    }

    @Test
    fun `a gone blob fails permanently and its record is dropped`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1") } returns null

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_BLOB_GONE))
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `an upload that yields no usable media fails permanently and drops the bytes`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1") } returns item
        coEvery { mediaRepository.upload(listOf(item)) } returns NetworkResult.Success(emptyList())

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_NO_MEDIA))
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }
}

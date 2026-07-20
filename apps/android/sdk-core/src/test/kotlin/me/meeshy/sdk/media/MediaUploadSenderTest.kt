package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test

class MediaUploadSenderTest {

    private fun item() =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = "photo.jpg", mimeType = "image/jpeg")

    private fun media(id: String, url: String = "https://cdn.meeshy.me/$id.jpg") = UploadedMedia(
        id = id,
        url = url,
        mimeType = "image/jpeg",
        fileSize = 4096L,
        width = 1080,
        height = 720,
        durationMs = null,
        thumbnailUrl = null,
    )

    @Test
    fun `gone blob is a permanent failure without uploading`() = runTest {
        var uploadCalls = 0

        val result = MediaUploadSender.send(item = null) { uploadCalls++; NetworkResult.Success(emptyList()) }

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_BLOB_GONE))
        assertThat(uploadCalls).isEqualTo(0)
    }

    @Test
    fun `transport failure is a transient failure`() = runTest {
        val result = MediaUploadSender.send(item()) { NetworkResult.Failure(ApiError("offline")) }

        assertThat(result).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `delivered upload carries the real media id`() = runTest {
        val result = MediaUploadSender.send(item()) { NetworkResult.Success(listOf(media("m1"))) }

        assertThat(result).isEqualTo(SendResult.SuccessWithId("m1"))
    }

    @Test
    fun `multiple produced media yield the first id`() = runTest {
        val result = MediaUploadSender.send(item()) {
            NetworkResult.Success(listOf(media("first"), media("second")))
        }

        assertThat(result).isEqualTo(SendResult.SuccessWithId("first"))
    }

    @Test
    fun `success with no usable media is a permanent failure`() = runTest {
        val result = MediaUploadSender.send(item()) { NetworkResult.Success(emptyList()) }

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_NO_MEDIA))
    }

    @Test
    fun `success with a blank media id is a permanent failure`() = runTest {
        val result = MediaUploadSender.send(item()) { NetworkResult.Success(listOf(media(id = "   "))) }

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_NO_MEDIA))
    }

    @Test
    fun `the stored item is the one uploaded`() = runTest {
        val stored = item()
        var uploaded: MediaUploadItem? = null

        MediaUploadSender.send(stored) { uploaded = it; NetworkResult.Success(listOf(media("m1"))) }

        assertThat(uploaded).isSameInstanceAs(stored)
    }
}

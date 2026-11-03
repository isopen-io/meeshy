package me.meeshy.sdk.call

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test
import java.io.File

class CallRecordingUploaderTest {

    private fun media(id: String) = UploadedMedia(id, "https://cdn/x", "audio/mp4", 3L, null, null, null, null)

    private fun file() = File.createTempFile("appel", ".m4a").apply { writeBytes(byteArrayOf(1, 2, 3)) }

    @Test
    fun `the recording leaves from disk as a message attachment and its id comes back`() = runTest {
        val tus = mockk<TusUploadRepository>()
        val item = slot<MediaUploadItem>()
        val context = slot<TusUploadContext>()
        coEvery { tus.upload(capture(item), capture(context), any(), any()) } returns NetworkResult.Success(listOf(media("att-9")))
        val recording = file()

        val result = TusCallRecordingUploader(tus).upload(recording, "audio/mp4")

        assertThat(result.getOrNull()).isEqualTo("att-9")
        assertThat(context.captured).isEqualTo(TusUploadContext.ATTACHMENT)
        assertThat(item.captured.mimeType).isEqualTo("audio/mp4")
        assertThat(item.captured.fileName).isEqualTo(recording.name)
        assertThat(item.captured.sizeBytes).isEqualTo(3L)
    }

    @Test
    fun `a refused upload is a failure the controller turns into the save-failed notice`() = runTest {
        val tus = mockk<TusUploadRepository>()
        coEvery { tus.upload(any(), any(), any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        assertThat(TusCallRecordingUploader(tus).upload(file(), "audio/mp4").isFailure).isTrue()
    }

    @Test
    fun `an upload that returns no attachment is a failure`() = runTest {
        val tus = mockk<TusUploadRepository>()
        coEvery { tus.upload(any(), any(), any(), any()) } returns NetworkResult.Success(emptyList())

        assertThat(TusCallRecordingUploader(tus).upload(file(), "video/mp4").isFailure).isTrue()
    }
}

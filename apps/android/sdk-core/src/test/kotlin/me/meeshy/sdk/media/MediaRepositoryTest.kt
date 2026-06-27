package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MediaAttachmentWire
import me.meeshy.sdk.model.MediaUploadResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MediaApi
import okhttp3.MultipartBody
import org.junit.Test
import java.io.IOException

class MediaRepositoryTest {

    private val api: MediaApi = mockk(relaxed = true)

    private fun repository() = MediaRepository(api)

    private fun item(name: String = "photo.jpg", mime: String = "image/jpeg") =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = mime)

    @Test
    fun upload_emptyItems_returnsEmptyWithoutHittingApi() = runTest {
        val result = repository().upload(emptyList())

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat((result as NetworkResult.Success).data).isEmpty()
        coVerify(exactly = 0) { api.upload(any()) }
    }

    @Test
    fun upload_singleAttachment_mapsWireToDomain() = runTest {
        coEvery { api.upload(any()) } returns ApiResponse(
            success = true,
            data = MediaUploadResponse(
                attachments = listOf(
                    MediaAttachmentWire(
                        id = "m1",
                        fileUrl = "https://cdn.meeshy.me/m1.jpg",
                        mimeType = "image/jpeg",
                        fileSize = 4096L,
                        width = 1080,
                        height = 720,
                    ),
                ),
            ),
        )

        val media = (repository().upload(listOf(item())) as NetworkResult.Success).data

        assertThat(media).hasSize(1)
        assertThat(media[0].id).isEqualTo("m1")
        assertThat(media[0].url).isEqualTo("https://cdn.meeshy.me/m1.jpg")
        assertThat(media[0].width).isEqualTo(1080)
    }

    @Test
    fun upload_multipleAttachments_preservesOrder() = runTest {
        coEvery { api.upload(any()) } returns ApiResponse(
            success = true,
            data = MediaUploadResponse(
                attachments = listOf(
                    MediaAttachmentWire(id = "a", fileUrl = "https://x/a"),
                    MediaAttachmentWire(id = "b", fileUrl = "https://x/b"),
                ),
            ),
        )

        val media = (repository().upload(listOf(item("a"), item("b"))) as NetworkResult.Success).data

        assertThat(media.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun upload_dropsUnusableRows_keepsValidOnes() = runTest {
        coEvery { api.upload(any()) } returns ApiResponse(
            success = true,
            data = MediaUploadResponse(
                attachments = listOf(
                    MediaAttachmentWire(id = "", fileUrl = "https://x/blank-id"),
                    MediaAttachmentWire(id = "ok", fileUrl = "https://x/ok"),
                    MediaAttachmentWire(id = "no-url", fileUrl = null),
                ),
            ),
        )

        val media = (repository().upload(listOf(item())) as NetworkResult.Success).data

        assertThat(media.map { it.id }).containsExactly("ok")
    }

    @Test
    fun upload_passesOnePartPerItemUnderFilesField() = runTest {
        val captured = slot<List<MultipartBody.Part>>()
        coEvery { api.upload(capture(captured)) } returns
            ApiResponse(success = true, data = MediaUploadResponse(attachments = emptyList()))

        repository().upload(listOf(item("one.jpg"), item("two.png", "image/png")))

        assertThat(captured.captured).hasSize(2)
        val disposition = captured.captured[0].headers?.get("Content-Disposition").orEmpty()
        assertThat(disposition).contains("name=\"${MediaUpload.FIELD_NAME}\"")
        assertThat(disposition).contains("filename=\"one.jpg\"")
    }

    @Test
    fun upload_failureResponse_isFailure() = runTest {
        coEvery { api.upload(any()) } returns
            ApiResponse(success = false, error = "Payload too large")

        assertThat(repository().upload(listOf(item())))
            .isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun upload_networkError_isFailure() = runTest {
        coEvery { api.upload(any()) } throws IOException("offline")

        assertThat(repository().upload(listOf(item())))
            .isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun upload_successWithNoAttachments_mapsToEmptyList() = runTest {
        coEvery { api.upload(any()) } returns
            ApiResponse(success = true, data = MediaUploadResponse(attachments = emptyList()))

        val media = (repository().upload(listOf(item())) as NetworkResult.Success).data

        assertThat(media).isEmpty()
    }
}

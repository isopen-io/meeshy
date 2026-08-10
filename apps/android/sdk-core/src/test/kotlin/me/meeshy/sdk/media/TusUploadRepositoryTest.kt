package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MediaAttachmentWire
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.media.TusUploadFinishData
import me.meeshy.sdk.model.media.TusUploadMetadata
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TusApi
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.Response
import java.io.IOException

class TusUploadRepositoryTest {

    private val api: TusApi = mockk(relaxed = true)

    private fun repository() = TusUploadRepository(api)

    private fun item(name: String = "story.jpg", mime: String = "image/jpeg") =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = mime)

    private fun locationResponse(location: String = "https://staging.meeshy.me/api/v1/uploads/abc123") =
        Response.success(Unit, Headers.headersOf("Location", location))

    private fun errorResponse(code: Int) =
        Response.error<Unit>(code, "denied".toResponseBody("text/plain".toMediaTypeOrNull()))

    private fun finishResponse(attachment: MediaAttachmentWire?) =
        ApiResponse(success = true, data = TusUploadFinishData(attachment = attachment))

    @Test
    fun `successful create and patch maps the finish attachment to UploadedMedia`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(
            MediaAttachmentWire(
                id = "pm1",
                fileUrl = "https://cdn.meeshy.me/pm1.jpg",
                mimeType = "image/jpeg",
                fileSize = 2048L,
                width = 800,
                height = 600,
            ),
        )

        val result = repository().upload(item(), TusUploadContext.STORY)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        val media = (result as NetworkResult.Success).data
        assertThat(media).hasSize(1)
        assertThat(media[0].id).isEqualTo("pm1")
        assertThat(media[0].url).isEqualTo("https://cdn.meeshy.me/pm1.jpg")
    }

    @Test
    fun `sends the Upload-Length and encoded Upload-Metadata on create`() = runTest {
        val length = slot<Long>()
        val metadata = slot<String>()
        coEvery { api.createUpload(capture(length), capture(metadata), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(item(name = "clip.jpg", mime = "image/jpeg"), TusUploadContext.POST)

        assertThat(length.captured).isEqualTo(3L)
        assertThat(metadata.captured).isEqualTo(
            TusUploadMetadata.headerValue("clip.jpg", "image/jpeg", TusUploadContext.POST),
        )
    }

    @Test
    fun `patches at the Location returned by create, offset zero, with the whole body`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns
            locationResponse(location = "https://staging.meeshy.me/api/v1/uploads/xyz")
        val location = slot<String>()
        val offset = slot<Long>()
        val body = slot<okhttp3.RequestBody>()
        coEvery { api.uploadData(capture(location), capture(offset), any(), capture(body)) } returns
            finishResponse(null)

        repository().upload(item(), TusUploadContext.STORY)

        assertThat(location.captured).isEqualTo("https://staging.meeshy.me/api/v1/uploads/xyz")
        assertThat(offset.captured).isEqualTo(0L)
        assertThat(body.captured.contentType().toString()).isEqualTo("application/offset+octet-stream")
    }

    @Test
    fun `create and patch happen in order`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(item(), TusUploadContext.STORY)

        coVerifyOrder {
            api.createUpload(any(), any(), any())
            api.uploadData(any(), any(), any(), any())
        }
    }

    @Test
    fun `create failure is a failure and never patches`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns errorResponse(403)

        val result = repository().upload(item(), TusUploadContext.STORY)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(403)
        coVerify(exactly = 0) { api.uploadData(any(), any(), any(), any()) }
    }

    @Test
    fun `create success without a Location header is a failure and never patches`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns Response.success(Unit)

        val result = repository().upload(item(), TusUploadContext.STORY)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { api.uploadData(any(), any(), any(), any()) }
    }

    @Test
    fun `create network error is a failure`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } throws IOException("offline")

        assertThat(repository().upload(item(), TusUploadContext.STORY))
            .isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `patch failure envelope is a failure`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns
            ApiResponse(success = false, error = "too large")

        assertThat(repository().upload(item(), TusUploadContext.STORY))
            .isInstanceOf(NetworkResult.Failure::class.java)
    }

    @Test
    fun `finish response with no attachment maps to an empty (but successful) list`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        val result = repository().upload(item(), TusUploadContext.STORY)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat((result as NetworkResult.Success).data).isEmpty()
    }

    @Test
    fun `finish response with an unusable (blank id) attachment maps to an empty list`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns
            finishResponse(MediaAttachmentWire(id = "", fileUrl = "https://cdn/x.jpg"))

        val result = repository().upload(item(), TusUploadContext.STORY)

        assertThat((result as NetworkResult.Success).data).isEmpty()
    }

    // --- uploadAll: sequential batch over the same single-item upload ---

    @Test
    fun `uploadAll of an empty list is success without calling the api`() = runTest {
        val result = repository().uploadAll(emptyList(), TusUploadContext.STORY)

        assertThat(result).isEqualTo(NetworkResult.Success(emptyList<me.meeshy.sdk.model.UploadedMedia>()))
        coVerify(exactly = 0) { api.createUpload(any(), any(), any()) }
    }

    @Test
    fun `uploadAll uploads every item in order and flattens the results`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returnsMany listOf(
            finishResponse(MediaAttachmentWire(id = "a", fileUrl = "https://cdn/a.jpg")),
            finishResponse(MediaAttachmentWire(id = "b", fileUrl = "https://cdn/b.jpg")),
        )

        val result = repository().uploadAll(listOf(item("a.jpg"), item("b.jpg")), TusUploadContext.STORY)

        assertThat((result as NetworkResult.Success).data.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `uploadAll stops at the first failure and never uploads the remaining items`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returnsMany listOf(locationResponse(), errorResponse(500))
        coEvery { api.uploadData(any(), any(), any(), any()) } returns
            finishResponse(MediaAttachmentWire(id = "a", fileUrl = "https://cdn/a.jpg"))

        val result = repository().uploadAll(
            listOf(item("a.jpg"), item("b.jpg"), item("c.jpg")),
            TusUploadContext.STORY,
        )

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 2) { api.createUpload(any(), any(), any()) }
        coVerify(exactly = 1) { api.uploadData(any(), any(), any(), any()) }
    }

    // --- chunking: a body larger than chunkSizeBytes is split across uploadChunk
    // (every slice but the last) + uploadData (the last slice only) ---

    private fun chunkResponse() = Response.success(Unit)

    @Test
    fun `a body no larger than the chunk size makes a single PATCH via uploadData, never uploadChunk`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(item(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        coVerify(exactly = 0) { api.uploadChunk(any(), any(), any(), any()) }
        coVerify(exactly = 1) { api.uploadData(any(), any(), any(), any()) }
    }

    @Test
    fun `a body larger than the chunk size is split, only the last slice goes through uploadData`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns
            finishResponse(MediaAttachmentWire(id = "pm1", fileUrl = "https://cdn/pm1.jpg"))

        val bigItem = MediaUploadItem(bytes = ByteArray(25) { it.toByte() }, fileName = "video.mp4", mimeType = "video/mp4")
        val result = repository().upload(bigItem, TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 2) { api.uploadChunk(any(), any(), any(), any()) }
        coVerify(exactly = 1) { api.uploadData(any(), any(), any(), any()) }
    }

    @Test
    fun `chunks are patched in order at increasing offsets, the last chunk carrying the remainder`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        val chunkOffsets = mutableListOf<Long>()
        coEvery { api.uploadChunk(any(), capture(chunkOffsets), any(), any()) } returns chunkResponse()
        val finalOffset = slot<Long>()
        val finalBody = slot<okhttp3.RequestBody>()
        coEvery { api.uploadData(any(), capture(finalOffset), any(), capture(finalBody)) } returns
            finishResponse(MediaAttachmentWire(id = "pm1", fileUrl = "https://cdn/pm1.jpg"))

        val bigItem = MediaUploadItem(bytes = ByteArray(25) { it.toByte() }, fileName = "video.mp4", mimeType = "video/mp4")
        repository().upload(bigItem, TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(chunkOffsets).containsExactly(0L, 10L).inOrder()
        assertThat(finalOffset.captured).isEqualTo(20L)
        assertThat(finalBody.captured.contentLength()).isEqualTo(5L)
    }

    @Test
    fun `an intermediate chunk failure stops the upload and never sends the final chunk`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns
            Response.error(409, "offset mismatch".toResponseBody("text/plain".toMediaTypeOrNull()))

        val bigItem = MediaUploadItem(bytes = ByteArray(25) { it.toByte() }, fileName = "video.mp4", mimeType = "video/mp4")
        val result = repository().upload(bigItem, TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat((result as NetworkResult.Failure).error.httpStatus).isEqualTo(409)
        coVerify(exactly = 0) { api.uploadData(any(), any(), any(), any()) }
    }
}

package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.TusUploadCheckpointEntity
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
    private val checkpoints: TusUploadCheckpointDao = mockk(relaxed = true)
    private val apiBaseUrl = "https://gate/api/v1/"

    // checkpoints.find(...) is relaxed-mocked to null unless a test stubs it explicitly
    // (with the specific matching key) before calling repository() — see the resume tests below.
    private fun repository() = TusUploadRepository(api, checkpoints, OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(), kotlinx.coroutines.Dispatchers.Unconfined), me.meeshy.sdk.net.MeeshyConfig(apiBaseUrl = apiBaseUrl))

    private fun item(name: String = "story.jpg", mime: String = "application/octet-stream") =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = mime)

    private fun locationResponse(location: String = "https://gate/api/v1/uploads/abc123") =
        Response.success(Unit, Headers.headersOf("Location", location))

    private fun errorResponse(code: Int) =
        Response.error<Unit>(code, "denied".toResponseBody("text/plain".toMediaTypeOrNull()))

    private fun finishResponse(attachment: MediaAttachmentWire?) =
        ApiResponse(success = true, data = TusUploadFinishData(attachment = attachment))


    /** Un JPEG minimal dont l'EXIF porte un GPS (marqueur « SECRETGPS » dans une note du fabricant) et un XMP. */
    private fun geotaggedJpeg(): ByteArray {
        fun seg(marker: Int, payload: ByteArray) = byteArrayOf(0xFF.toByte(), marker.toByte(), ((payload.size + 2) shr 8).toByte(), (payload.size + 2).toByte()) + payload
        val tiff = java.nio.ByteBuffer.allocate(96).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        tiff.put("II".toByteArray()).putShort(0x2A).putInt(8).putShort(1)
        tiff.putShort(0x8825.toShort()).putShort(4).putInt(1).putInt(0x30).putInt(0)
        tiff.position(0x30); tiff.putShort(1).putShort(1).putShort(2).putInt(2).putInt('N'.code).putInt(0)
        return byteArrayOf(0xFF.toByte(), 0xD8.toByte()) +
            seg(0xE1, "Exif\u0000\u0000".toByteArray(Charsets.ISO_8859_1) + tiff.array()) +
            seg(0xE1, "http://ns.adobe.com/xap/1.0/\u0000SECRETGPS".toByteArray(Charsets.ISO_8859_1)) +
            seg(0xDA, byteArrayOf(1, 1, 0, 0, 63, 0)) + byteArrayOf(5, 6, 7) + byteArrayOf(0xFF.toByte(), 0xD9.toByte())
    }

    @Test
    fun `a story photo with location is declared and sent without it`() = runTest {
        val length = slot<Long>()
        val body = slot<okhttp3.RequestBody>()
        coEvery { api.createUpload(capture(length), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), capture(body)) } returns finishResponse(null)
        val original = geotaggedJpeg()

        repository().upload(MediaUploadItem(original, "story.jpg", "image/jpeg"), TusUploadContext.STORY)

        val sent = okio.Buffer().also { body.captured.writeTo(it) }.readByteArray()
        assertThat(String(sent, Charsets.ISO_8859_1)).doesNotContain("SECRETGPS")
        assertThat(length.captured).isEqualTo(sent.size.toLong())
        assertThat(sent.size).isLessThan(original.size)
    }

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

        repository().upload(item(name = "clip.jpg", mime = "application/octet-stream"), TusUploadContext.POST)

        assertThat(length.captured).isEqualTo(3L)
        assertThat(metadata.captured).isEqualTo(
            TusUploadMetadata.headerValue("clip.jpg", "application/octet-stream", TusUploadContext.POST),
        )
    }

    @Test
    fun `patches at the Location returned by create, offset zero, with the whole body`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns
            locationResponse(location = "https://gate/api/v1/uploads/xyz")
        val location = slot<String>()
        val offset = slot<Long>()
        val body = slot<okhttp3.RequestBody>()
        coEvery { api.uploadData(capture(location), capture(offset), any(), capture(body)) } returns
            finishResponse(null)

        repository().upload(item(), TusUploadContext.STORY)

        assertThat(location.captured).isEqualTo("https://gate/api/v1/uploads/xyz")
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

    // --- checkpointed retries: a Room-backed checkpoint lets a retried upload skip
    // already-acknowledged chunks instead of restarting from byte zero ---

    private fun bigItem(bytes: Int = 25) =
        MediaUploadItem(bytes = ByteArray(bytes) { it.toByte() }, fileName = "video.mp4", mimeType = "video/mp4")

    @Test
    fun `a single-chunk upload never persists intermediate progress via upsert`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(item(), TusUploadContext.STORY)

        coVerify(exactly = 0) { checkpoints.upsert(any()) }
    }

    @Test
    fun `a successful upload defensively clears any checkpoint for its key even with a single chunk`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(item(), TusUploadContext.STORY)

        coVerify(exactly = 1) { checkpoints.delete(any()) }
    }

    @Test
    fun `a successful intermediate chunk persists a checkpoint at the new offset`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse(location = "https://gate/uploads/abc")
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)
        val saved = slot<TusUploadCheckpointEntity>()
        coEvery { checkpoints.upsert(capture(saved)) } returns Unit

        // 15 bytes over a 10-byte chunk size makes exactly one intermediate chunk ([0,10))
        // followed by one final chunk ([10,15)), so the single captured upsert is unambiguous.
        repository().upload(bigItem(bytes = 15), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(saved.captured.location).isEqualTo("https://gate/uploads/abc")
        assertThat(saved.captured.uploadedBytes).isEqualTo(10L)
        assertThat(saved.captured.totalBytes).isEqualTo(15L)
    }

    @Test
    fun `every intermediate chunk of a multi-chunk upload persists its own growing offset`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)
        val savedOffsets = mutableListOf<Long>()
        coEvery { checkpoints.upsert(any()) } coAnswers { savedOffsets += (it.invocation.args[0] as TusUploadCheckpointEntity).uploadedBytes }

        // 25 bytes over a 10-byte chunk size makes two intermediate chunks ([0,10), [10,20)).
        repository().upload(bigItem(bytes = 25), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(savedOffsets).containsExactly(10L, 20L).inOrder()
    }

    @Test
    fun `a successful final chunk deletes the checkpoint`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns
            finishResponse(MediaAttachmentWire(id = "pm1", fileUrl = "https://cdn/pm1.jpg"))
        val key = slot<String>()
        coEvery { checkpoints.delete(capture(key)) } returns Unit

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(key.captured).isEqualTo(
            me.meeshy.sdk.model.media.TusCheckpointKey.of(TusUploadContext.STORY, "video.mp4", "video/mp4", 25L),
        )
    }

    @Test
    fun `a failed intermediate chunk never writes a checkpoint for that failed chunk`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns
            Response.error(409, "offset mismatch".toResponseBody("text/plain".toMediaTypeOrNull()))

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        coVerify(exactly = 0) { checkpoints.upsert(any()) }
    }

    @Test
    fun `a failed final chunk leaves any existing checkpoint untouched`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns
            ApiResponse(success = false, error = "too large")

        val result = repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { checkpoints.delete(any()) }
    }

    private fun headResponse(offset: Long) = Response.success(Unit, Headers.headersOf("Upload-Offset", offset.toString()))

    private fun storedCheckpoint(uploaded: Long = 10L, location: String = "https://gate/uploads/resume-me"): String {
        val key = me.meeshy.sdk.model.media.TusCheckpointKey.of(TusUploadContext.STORY, "video.mp4", "video/mp4", 25L)
        coEvery { checkpoints.find(key) } returns TusUploadCheckpointEntity(
            checkpointKey = key,
            location = location,
            uploadedBytes = uploaded,
            totalBytes = 25L,
            updatedAt = 0L,
        )
        return key
    }

    @Test
    fun `an interrupted upload resumes at the offset the SERVER reports without creating a new session`() = runTest {
        storedCheckpoint(uploaded = 10L)
        coEvery { api.headUpload("https://gate/uploads/resume-me", any()) } returns headResponse(20L)
        val chunkOffsets = mutableListOf<Long>()
        val finalOffset = slot<Long>()
        coEvery { api.uploadChunk(any(), capture(chunkOffsets), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), capture(finalOffset), any(), any()) } returns
            finishResponse(MediaAttachmentWire(id = "pm1", fileUrl = "https://cdn/pm1.jpg"))

        val result = repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 0) { api.createUpload(any(), any(), any()) }
        assertThat(chunkOffsets).isEmpty()
        assertThat(finalOffset.captured).isEqualTo(20L)
    }

    @Test
    fun `a server offset that is not on a chunk boundary is honoured to the byte`() = runTest {
        storedCheckpoint(uploaded = 10L)
        coEvery { api.headUpload(any(), any()) } returns headResponse(7L)
        val chunkOffsets = mutableListOf<Long>()
        val finalOffset = slot<Long>()
        coEvery { api.uploadChunk(any(), capture(chunkOffsets), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), capture(finalOffset), any(), any()) } returns finishResponse(null)

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(chunkOffsets).containsExactly(7L)
        assertThat(finalOffset.captured).isEqualTo(17L)
    }

    @Test
    fun `a session the server forgot is dropped from the checkpoint and the upload starts over`() = runTest {
        val key = storedCheckpoint()
        coEvery { api.headUpload(any(), any()) } returns Response.error(404, "gone".toResponseBody("text/plain".toMediaTypeOrNull()))
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse(location = "https://gate/uploads/fresh")
        val patched = mutableListOf<String>()
        coEvery { api.uploadChunk(capture(patched), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(capture(patched), any(), any(), any()) } returns finishResponse(null)

        val result = repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(exactly = 1) { api.createUpload(any(), any(), any()) }
        assertThat(patched.distinct()).containsExactly("https://gate/uploads/fresh")
        coVerify { checkpoints.delete(key) }
    }

    @Test
    fun `a checkpoint at zero confirmed bytes is still verified with the server then reused`() = runTest {
        storedCheckpoint(uploaded = 0L)
        coEvery { api.headUpload(any(), any()) } returns headResponse(0L)
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        coVerify(exactly = 0) { api.createUpload(any(), any(), any()) }
    }

    @Test
    fun `a session the server holds complete starts over because its finish answer is lost`() = runTest {
        storedCheckpoint()
        coEvery { api.headUpload(any(), any()) } returns headResponse(25L)
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        coVerify(exactly = 1) { api.createUpload(any(), any(), any()) }
    }

    @Test
    fun `a server that cannot be reached is a failure and neither resumes nor restarts blindly`() = runTest {
        storedCheckpoint()
        coEvery { api.headUpload(any(), any()) } throws IOException("offline")

        val result = repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { api.createUpload(any(), any(), any()) }
        coVerify(exactly = 0) { api.uploadChunk(any(), any(), any(), any()) }
        coVerify(exactly = 0) { checkpoints.delete(any()) }
    }

    @Test
    fun `progress is reported from the starting offset through every chunk to the whole body`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)
        val seen = mutableListOf<Pair<Long, Long>>()

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L) { sent, total -> seen += sent to total }

        assertThat(seen).containsExactly(0L to 25L, 10L to 25L, 20L to 25L, 25L to 25L).inOrder()
    }

    @Test
    fun `a resumed upload starts its progress at the bytes already on the server`() = runTest {
        storedCheckpoint()
        coEvery { api.headUpload(any(), any()) } returns headResponse(20L)
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)
        val seen = mutableListOf<Pair<Long, Long>>()

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L) { sent, total -> seen += sent to total }

        assertThat(seen.first()).isEqualTo(20L to 25L)
        assertThat(seen.last()).isEqualTo(25L to 25L)
    }

    @Test
    fun `a session the server says is not ours (another account on this device) is dropped and the upload starts over`() = runTest {
        val key = storedCheckpoint()
        coEvery { api.headUpload(any(), any()) } returns errorResponse(403)
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse(location = "https://gate/uploads/mine")
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        val result = repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify { checkpoints.delete(key) }
        coVerify(exactly = 1) { api.createUpload(any(), any(), any()) }
    }

    @Test
    fun `a stored session on another host is never contacted with the token and the upload starts over`() = runTest {
        val key = storedCheckpoint(location = "https://staging.example/api/v1/uploads/resume-me")
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse(location = "https://gate/uploads/mine")
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkResponse()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finishResponse(null)

        repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        coVerify(exactly = 0) { api.headUpload(any(), any()) }
        coVerify(exactly = 0) { api.uploadChunk(match { it.contains("staging.example") }, any(), any(), any()) }
        coVerify { checkpoints.delete(key) }
    }

    @Test
    fun `a session address on another host returned by create is refused before any byte or token leaves`() = runTest {
        coEvery { api.createUpload(any(), any(), any()) } returns locationResponse(location = "https://evil.example/api/v1/uploads/x")

        val result = repository().upload(bigItem(), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { api.uploadChunk(any(), any(), any(), any()) }
        coVerify(exactly = 0) { api.uploadData(any(), any(), any(), any()) }
        coVerify(exactly = 0) { checkpoints.upsert(any()) }
    }
}

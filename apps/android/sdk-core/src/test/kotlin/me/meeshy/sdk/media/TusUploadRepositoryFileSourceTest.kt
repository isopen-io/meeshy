package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.entity.TusUploadCheckpointEntity
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MediaAttachmentWire
import me.meeshy.sdk.model.media.TusCheckpointKey
import me.meeshy.sdk.model.media.TusTranscription
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.media.TusUploadFinishData
import me.meeshy.sdk.model.media.UploadFileState
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TusApi
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import retrofit2.Response
import java.io.File

class TusUploadRepositoryFileSourceTest {
    @get:Rule val folder = TemporaryFolder()

    private val api: TusApi = mockk(relaxed = true)
    private val checkpoints: TusUploadCheckpointDao = mockk(relaxed = true)
    private val progress = UploadProgressCenter()
    private val leases = TusUploadLeases()

    private fun repository() = TusUploadRepository(
        api, checkpoints,
        OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(), kotlinx.coroutines.Dispatchers.Unconfined),
        MeeshyConfig(apiBaseUrl = "https://gate/api/v1/"), UploadedMediaSeeder.None, leases, FileDigestMemo(), progress,
    )

    /** Un faux « mp4 » sans moov : une seule boîte `mdat` qui couvre tout le fichier, que le nettoyeur laisse intacte. */
    private fun videoFile(name: String = "clip.mp4", size: Int = 25): File =
        folder.newFile(name).also { file -> file.writeBytes(fakeMp4(size) { it.toByte() }) }

    private fun fakeMp4(size: Int, fill: (Int) -> Byte): ByteArray =
        ByteArray(size) { index ->
            when (index) {
                in 0..3 -> (size ushr (8 * (3 - index))).toByte()
                in 4..7 -> "mdat"[index - 4].code.toByte()
                else -> fill(index)
            }
        }

    private fun onDisk(file: File, name: String = file.name) = MediaUploadItem.onDisk(file, name, "video/mp4")

    private fun created(location: String = "https://gate/api/v1/uploads/s1") = Response.success(Unit, Headers.headersOf("Location", location))
    private fun chunkOk() = Response.success(Unit)
    private fun head(offset: Long) = Response.success(Unit, Headers.headersOf("Upload-Offset", offset.toString()))
    private fun finish() = ApiResponse(success = true, data = TusUploadFinishData(MediaAttachmentWire(id = "pm1", fileUrl = "https://cdn/pm1.mp4")))
    private fun status(code: Int) = Response.error<Unit>(code, "x".toResponseBody("text/plain".toMediaTypeOrNull()))

    private fun contentKey(file: File) =
        TusCheckpointKey.ofContent(ContentHash.sha256Hex(MediaUploadSource.OnDisk(file)), TusUploadContext.STORY)

    private fun bytesOf(body: okhttp3.RequestBody) = okio.Buffer().also { body.writeTo(it) }.readByteArray()

    @Test
    fun `a file is read in slices bounded by the chunk size, never as one array`() = runTest {
        val file = videoFile(size = 25)
        coEvery { api.createUpload(any(), any(), any()) } returns created()
        val lengths = mutableListOf<Long>()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } coAnswers { lengths += arg<okhttp3.RequestBody>(3).contentLength(); chunkOk() }
        coEvery { api.uploadData(any(), any(), any(), any()) } coAnswers { lengths += arg<okhttp3.RequestBody>(3).contentLength(); finish() }

        val result = repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(lengths).containsExactly(10L, 10L, 5L).inOrder()
    }

    @Test
    fun `the slices are the exact ranges of the file`() = runTest {
        val file = videoFile(size = 25)
        coEvery { api.createUpload(any(), any(), any()) } returns created()
        val seen = mutableListOf<ByteArray>()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } coAnswers { seen += bytesOf(arg(3)); chunkOk() }
        coEvery { api.uploadData(any(), any(), any(), any()) } coAnswers { seen += bytesOf(arg(3)); finish() }

        repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(seen.reduce { a, b -> a + b }.toList()).isEqualTo(file.readBytes().toList())
    }

    @Test
    fun `after a kill the upload resumes at the offset the server accepted, without resending those octets`() = runTest {
        val file = videoFile(size = 25)
        val key = contentKey(file)
        coEvery { checkpoints.find(key) } returns TusUploadCheckpointEntity(key, "https://gate/api/v1/uploads/s1", 10L, 25L, 0L)
        coEvery { api.headUpload("https://gate/api/v1/uploads/s1", any()) } returns head(20L)
        val offsets = mutableListOf<Long>()
        val sizes = mutableListOf<Int>()
        coEvery { api.uploadData(any(), any(), any(), any()) } coAnswers { offsets += arg<Long>(1); sizes += bytesOf(arg(3)).size; finish() }

        repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 10L)

        coVerify(exactly = 0) { api.createUpload(any(), any(), any()) }
        assertThat(offsets).containsExactly(20L)
        assertThat(sizes).containsExactly(5)
    }

    @Test
    fun `renaming the file keeps the checkpoint, another content does not match it`() = runTest {
        val original = videoFile("before.mp4")
        val renamed = folder.newFile("after.mp4").also { original.copyTo(it, overwrite = true) }
        val other = videoFile("other.mp4", size = 26)

        assertThat(contentKey(renamed)).isEqualTo(contentKey(original))
        assertThat(contentKey(other)).isNotEqualTo(contentKey(original))
    }

    @Test
    fun `a file modified since the checkpoint starts over`() = runTest {
        val file = videoFile(size = 25)
        val staleKey = contentKey(file)
        file.writeBytes(fakeMp4(25) { 9 })
        coEvery { checkpoints.find(staleKey) } returns TusUploadCheckpointEntity(staleKey, "https://gate/api/v1/uploads/old", 10L, 25L, 0L)
        coEvery { api.createUpload(any(), any(), any()) } returns created()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finish()

        repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 100L)

        coVerify(exactly = 1) { api.createUpload(25L, any(), any()) }
        coVerify(exactly = 0) { api.headUpload(any(), any()) }
    }

    @Test
    fun `a PATCH answering 410 drops the checkpoint and the replay opens a fresh session`() = runTest {
        val file = videoFile(size = 25)
        val key = contentKey(file)
        coEvery { api.createUpload(any(), any(), any()) } returns created()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returnsMany listOf(status(410), chunkOk(), chunkOk())
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finish()

        val result = repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 10L)

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        coVerify(atLeast = 1) { checkpoints.delete(key) }
        coVerify(exactly = 2) { api.createUpload(any(), any(), any()) }
    }

    @Test
    fun `the creation header declares thumbhash, capture and transcription`() = runTest {
        val file = videoFile(size = 8)
        val metadata = mutableListOf<String>()
        coEvery { api.createUpload(any(), capture(metadata), any()) } returns created()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finish()

        repository().upload(
            onDisk(file, "original.mp4"), TusUploadContext.ATTACHMENT,
            extras = TusUploadExtras(thumbHash = "TH", transcription = TusTranscription("hi", "en"), capturedInApp = true),
        )

        val keys = metadata.single().split(",").map { it.substringBefore(" ") }
        assertThat(keys).containsExactly("filename", "filetype", "uploadcontext", "thumbhash", "transcription", "capturedinapp").inOrder()
        assertThat(metadata.single()).startsWith(filenamePair("original.mp4"))
    }

    private fun filenamePair(name: String) = "filename " + java.util.Base64.getEncoder().encodeToString(name.toByteArray())

    @Test
    fun `two sends of the same octets never share a session, the second opens its own`() = runTest {
        val file = videoFile(size = 25)
        leases.claim(contentKey(file))
        val key = contentKey(file)
        coEvery { checkpoints.find(key) } returns TusUploadCheckpointEntity(key, "https://gate/api/v1/uploads/held", 10L, 25L, 0L)
        coEvery { api.createUpload(any(), any(), any()) } returns created("https://gate/api/v1/uploads/own")
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finish()

        repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 100L)

        coVerify(exactly = 0) { api.headUpload("https://gate/api/v1/uploads/held", any()) }
        coVerify(exactly = 1) { api.createUpload(any(), any(), any()) }
    }

    @Test
    fun `progress is published per file and leaves the map once delivered`() = runTest {
        val file = videoFile(size = 25)
        coEvery { api.createUpload(any(), any(), any()) } returns created()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } returns chunkOk()
        coEvery { api.uploadData(any(), any(), any(), any()) } returns finish()
        val seen = mutableListOf<UploadFileState>()
        coEvery { api.uploadChunk(any(), any(), any(), any()) } coAnswers { seen += progress.files.value.getValue("p1"); chunkOk() }

        repository().upload(onDisk(file), TusUploadContext.STORY, chunkSizeBytes = 10L, extras = TusUploadExtras(progressId = "p1"))

        assertThat(seen.first()).isInstanceOf(UploadFileState.Uploading::class.java)
        assertThat(progress.files.value).isEmpty()
    }

    @Test
    fun `an exhausted retry leaves the file failed but retryable`() = runTest {
        val file = videoFile(size = 8)
        coEvery { api.createUpload(any(), any(), any()) } returns status(503)

        val result = repository().upload(onDisk(file), TusUploadContext.STORY, extras = TusUploadExtras(progressId = "p2"))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(progress.files.value["p2"]).isEqualTo(UploadFileState.Failed(retryable = true))
    }
}

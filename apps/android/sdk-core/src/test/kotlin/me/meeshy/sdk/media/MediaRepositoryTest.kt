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

    private fun repository() = MediaRepository(api, OutgoingMediaSanitizer(InMemoryOutgoingPhotoLocationStore(), kotlinx.coroutines.Dispatchers.Unconfined))

    private fun item(name: String = "photo.jpg", mime: String = "application/octet-stream") =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = mime)


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
    fun upload_photoWithLocation_leavesWithoutIt() = runTest {
        val parts = slot<List<MultipartBody.Part>>()
        coEvery { api.upload(capture(parts)) } returns ApiResponse(success = true, data = MediaUploadResponse(attachments = emptyList()))

        repository().upload(listOf(MediaUploadItem(geotaggedJpeg(), "photo.jpg", "image/jpeg")))

        val sent = okio.Buffer().also { parts.captured.single().body.writeTo(it) }.readByteArray()
        assertThat(String(sent, Charsets.ISO_8859_1)).doesNotContain("SECRETGPS")
        assertThat(String(sent, Charsets.ISO_8859_1)).doesNotContain("Exif")
    }

    @Test
    fun upload_photoWithLocation_failsWhenItCannotBeCleaned() = runTest {
        val broken = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE1.toByte(), 0x7F, 0x00, 1, 2, 3, 4, 5, 6, 7, 8, 9)

        val result = repository().upload(listOf(MediaUploadItem(broken, "photo.jpg", "image/jpeg")))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        coVerify(exactly = 0) { api.upload(any()) }
    }

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

        repository().upload(listOf(item("one.jpg"), item("two.bin", "application/pdf")))

        assertThat(captured.captured).hasSize(2)
        val disposition = captured.captured[0].headers?.get("Content-Disposition").orEmpty()
        assertThat(disposition).contains("name=\"${MediaUpload.FIELD_NAME}\"")
        assertThat(disposition).contains("filename=\"one.jpg\"")
    }

    @Test
    fun upload_toAConversation_declaresItBeforeTheFiles_soTheGatewayNeverStoresTheBytesOfAnEndToEndOne() = runTest {
        val captured = slot<List<MultipartBody.Part>>()
        coEvery { api.upload(capture(captured)) } returns
            ApiResponse(success = true, data = MediaUploadResponse(attachments = emptyList()))

        repository().upload(listOf(item("one.jpg")), conversationId = "c-1")

        assertThat(captured.captured).hasSize(2)
        assertThat(captured.captured[0].headers?.get("Content-Disposition")).isEqualTo("form-data; name=\"conversationId\"")
        val value = okio.Buffer().also { captured.captured[0].body.writeTo(it) }.readUtf8()
        assertThat(value).isEqualTo("c-1")
        assertThat(captured.captured[1].headers?.get("Content-Disposition").orEmpty()).contains("filename=\"one.jpg\"")
    }

    @Test
    fun upload_withoutAConversation_sendsOnlyTheFiles() = runTest {
        val captured = slot<List<MultipartBody.Part>>()
        coEvery { api.upload(capture(captured)) } returns
            ApiResponse(success = true, data = MediaUploadResponse(attachments = emptyList()))

        repository().upload(listOf(item("one.jpg")))

        assertThat(captured.captured).hasSize(1)
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

    @Test
    fun requestTranscription_alreadyTranscribed_returnsIt() = runTest {
        val body = kotlinx.serialization.json.Json.parseToJsonElement(
            """{"taskId":null,"status":"completed","transcription":{"text":"Bonjour","language":"fr","confidence":0.8}}""",
        )
        coEvery { api.transcribe("a1", me.meeshy.sdk.model.TranscribeRequest(force = false)) } returns ApiResponse(success = true, data = body)

        val result = repository().requestTranscription("a1")

        assertThat((result as NetworkResult.Success).data?.text).isEqualTo("Bonjour")
    }

    @Test
    fun requestTranscription_processing_returnsNothingYet() = runTest {
        val body = kotlinx.serialization.json.Json.parseToJsonElement("""{"taskId":"t","status":"processing","transcription":null}""")
        coEvery { api.transcribe(any(), any()) } returns ApiResponse(success = true, data = body)

        val result = repository().requestTranscription("a1")

        assertThat((result as NetworkResult.Success).data).isNull()
    }

    @Test
    fun requestTranscription_refused_fails() = runTest {
        coEvery { api.transcribe(any(), any()) } throws IOException("offline")

        assertThat(repository().requestTranscription("a1")).isInstanceOf(NetworkResult.Failure::class.java)
    }
}

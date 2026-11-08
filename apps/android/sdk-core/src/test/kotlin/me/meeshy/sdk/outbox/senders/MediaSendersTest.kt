package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.media.MediaBlobStore
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadProgressLedger
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.MediaUploadPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxPlaintextAdmission
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test

class MediaSendersTest {

    private val mediaBlobStore = mockk<MediaBlobStore>(relaxed = true)
    private val mediaRepository = mockk<MediaRepository>()
    private val tusUploadRepository = mockk<TusUploadRepository>()
    private val ledger = MediaUploadProgressLedger()

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

    private val regimes = InMemoryEndToEndRegimeLedger()

    private fun handler() = UploadMediaHandler(mediaBlobStore, mediaRepository, tusUploadRepository, senderJson, ledger, regimes)

    private fun chatRow(conversationId: String = "c-1") =
        row(senderJson.encodeToString(MediaUploadPayload.serializer(), MediaUploadPayload(conversationId = conversationId)))

    private fun row(payload: String = "") =
        outboxRow(OutboxKind.UPLOAD_MEDIA, targetId = "cmid-1", payload = payload)

    @Test
    fun `a legacy upload with a blank payload goes through the attachment upload and yields the real id`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), any(), any()) } returns NetworkResult.Success(listOf(uploaded))

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.SuccessWithId("media-9"))
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `a chat upload declares its conversation to the gateway, which never stores the piece of an end to end one`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns NetworkResult.Success(listOf(uploaded))

        val result = handler().send(chatRow())

        assertThat(result).isEqualTo(SendResult.SuccessWithId("media-9"))
        coVerify(exactly = 1) { mediaRepository.upload(listOf(item), "c-1", any()) }
    }

    @Test
    fun `a chat upload that lands bridges its cmid to the server id of the piece`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns NetworkResult.Success(listOf(uploaded))
        val acknowledged = UploadedAttachmentIds()

        UploadMediaHandler(mediaBlobStore, mediaRepository, tusUploadRepository, senderJson, ledger, regimes, acknowledged).send(chatRow())

        assertThat(acknowledged.serverIdOf("cmid-1")).isEqualTo("media-9")
    }

    @Test
    fun `an upload that fails bridges nothing`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns
            NetworkResult.Failure(ApiError("down", code = "HTTP_503", httpStatus = 503))
        val acknowledged = UploadedAttachmentIds()

        UploadMediaHandler(mediaBlobStore, mediaRepository, tusUploadRepository, senderJson, ledger, regimes, acknowledged).send(chatRow())

        assertThat(acknowledged.serverIdOf("cmid-1")).isNull()
    }

    @Test
    fun `a chat upload refused in clear by an end to end conversation fails for good and the conversation is learned end to end`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns
            NetworkResult.Failure(ApiError("refused", code = "E2EE_PLAINTEXT_REFUSED", httpStatus = 400))

        val result = handler().send(chatRow())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_END_TO_END))
        assertThat(regimes.isSealed("c-1")).isTrue()
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `a chat upload whose conversation the gateway does not find fails for good instead of being replayed`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns
            NetworkResult.Failure(ApiError("Conversation not found", code = "CONVERSATION_NOT_FOUND", httpStatus = 404))

        val result = handler().send(chatRow())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE))
        assertThat(regimes.isSealed("c-1")).isFalse()
    }

    @Test
    fun `a 404 from the proxy while the gateway restarts is retried and the bytes are kept`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns
            NetworkResult.Failure(ApiError("404 page not found", code = "HTTP_404", httpStatus = 404))

        val result = handler().send(chatRow())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { mediaBlobStore.remove(any()) }
    }

    @Test
    fun `a chat upload exhausted while its conversation mode could not be read keeps its bytes for the retry`() = runTest {
        handler().onExhausted(chatRow().copy(lastError = "Deferred too long: ${OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED}"))

        coVerify(exactly = 0) { mediaBlobStore.remove(any()) }
    }

    @Test
    fun `a server error on a chat upload is still retried`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns
            NetworkResult.Failure(ApiError("down", httpStatus = 500))

        assertThat(handler().send(chatRow())).isEqualTo(SendResult.TransientFailure)
        assertThat(regimes.isSealed("c-1")).isFalse()
    }

    @Test
    fun `an upload tagged with a known context goes through the resumable upload`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { tusUploadRepository.upload(item, TusUploadContext.STORY, any(), any(), any()) } returns
            NetworkResult.Success(listOf(uploaded))

        val result = handler().send(row(encodedPayload(MediaUploadPayload(uploadContext = "story"))))

        assertThat(result).isEqualTo(SendResult.SuccessWithId("media-9"))
        coVerify(exactly = 0) { mediaRepository.upload(any(), any(), any()) }
    }

    @Test
    fun `an unrecognised or malformed context falls back to the legacy upload instead of failing`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), any(), any()) } returns NetworkResult.Success(listOf(uploaded))

        val unknown = handler().send(row(encodedPayload(MediaUploadPayload(uploadContext = "from-the-future"))))
        val malformed = handler().send(row("{not json"))

        assertThat(unknown).isEqualTo(SendResult.SuccessWithId("media-9"))
        assertThat(malformed).isEqualTo(SendResult.SuccessWithId("media-9"))
    }

    @Test
    fun `a transient upload failure keeps the bytes for the retry`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), any(), any()) } returns NetworkResult.Failure(ApiError("offline"))

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        coVerify(exactly = 0) { mediaBlobStore.remove(any()) }
    }

    @Test
    fun `a gone blob fails permanently and its record is dropped`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns null

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_BLOB_GONE))
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `an upload that yields no usable media fails permanently and drops the bytes`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), any(), any()) } returns NetworkResult.Success(emptyList())

        val result = handler().send(row())

        assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_NO_MEDIA))
        coVerify(exactly = 1) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `a publication upload that yields no usable media keeps its bytes until the author decides`() = runTest {
        listOf("post", "story", "status").forEach { context ->
            coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
            coEvery { tusUploadRepository.upload(item, any(), any(), any(), any()) } returns NetworkResult.Success(emptyList())

            val result = handler().send(row(encodedPayload(MediaUploadPayload(uploadContext = context))))

            assertThat(result).isEqualTo(SendResult.PermanentFailure(MediaUploadSender.REASON_NO_MEDIA))
        }
        coVerify(exactly = 0) { mediaBlobStore.remove(any()) }
    }

    @Test
    fun `an exhausted publication upload keeps its bytes for a retry or an explicit discard`() = runTest {
        listOf("post", "story", "status").forEach { context ->
            handler().onExhausted(row(encodedPayload(MediaUploadPayload(uploadContext = context))))
        }

        coVerify(exactly = 0) { mediaBlobStore.remove(any()) }
    }

    @Test
    fun `an exhausted chat or comment upload still drops its bytes`() = runTest {
        handler().onExhausted(row())
        handler().onExhausted(row(encodedPayload(MediaUploadPayload(uploadContext = "comment"))))

        coVerify(exactly = 2) { mediaBlobStore.remove("cmid-1") }
    }

    @Test
    fun `the bytes sent by a durable upload are published per media while it runs and cleared when it ends`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        val seen = mutableListOf<me.meeshy.sdk.model.media.MediaUploadProgress?>()
        coEvery { tusUploadRepository.upload(item, TusUploadContext.STORY, any(), any(), any()) } coAnswers {
            @Suppress("UNCHECKED_CAST")
            val report = arg<(Long, Long) -> Unit>(4)
            report(10L, 30L)
            seen += ledger.progress.value["cmid-1"]
            NetworkResult.Success(listOf(uploaded))
        }

        handler().send(row(payload = encodedPayload(MediaUploadPayload(uploadContext = "story"))))

        assertThat(seen.single()).isEqualTo(me.meeshy.sdk.model.media.MediaUploadProgress.Uploading(10L, 30L))
        assertThat(ledger.progress.value).doesNotContainKey("cmid-1")
    }

    @Test
    fun `a failed durable upload leaves no progress behind`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { tusUploadRepository.upload(item, TusUploadContext.STORY, any(), any(), any()) } returns
            NetworkResult.Failure(ApiError("offline"))

        handler().send(row(payload = encodedPayload(MediaUploadPayload(uploadContext = "story"))))

        assertThat(ledger.progress.value).isEmpty()
    }

    @Test
    fun `the bytes of a chat piece are published under its cmid while it leaves and cleared when it ends`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        val seen = mutableListOf<me.meeshy.sdk.model.media.MediaUploadProgress?>()
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } coAnswers {
            val report = arg<(Long, Long) -> Unit>(2)
            report(1L, 3L)
            seen += ledger.progress.value["cmid-1"]
            NetworkResult.Success(listOf(uploaded))
        }

        handler().send(chatRow())

        assertThat(seen.single()).isEqualTo(me.meeshy.sdk.model.media.MediaUploadProgress.Uploading(1L, 3L))
        assertThat(ledger.progress.value).isEmpty()
    }

    @Test
    fun `a failed chat piece leaves no progress behind`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } returns NetworkResult.Failure(ApiError("offline"))

        handler().send(chatRow())

        assertThat(ledger.progress.value).isEmpty()
    }

    @Test
    fun `a landed chat piece is known landed by the time its progress leaves the ledger, so its bubble never falls back`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } coAnswers {
            arg<(Long, Long) -> Unit>(2)(3L, 3L)
            NetworkResult.Success(listOf(uploaded))
        }
        val acknowledged = UploadedAttachmentIds()
        val landedWhenCleared = mutableListOf<String?>()
        var reported = false
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            ledger.progress.collect { progress ->
                if ("cmid-1" in progress) reported = true
                else if (reported) landedWhenCleared += acknowledged.serverIdOf("cmid-1")
            }
        }

        UploadMediaHandler(mediaBlobStore, mediaRepository, tusUploadRepository, senderJson, ledger, regimes, acknowledged).send(chatRow())

        assertThat(landedWhenCleared).containsExactly("media-9")
    }

    @Test
    fun `a chat piece replayed by the durable queue after a failed attempt publishes its progress under the same cmid`() = runTest {
        coEvery { mediaBlobStore.get("cmid-1", any()) } returns item
        val seen = mutableListOf<me.meeshy.sdk.model.media.MediaUploadProgress?>()
        var attempt = 0
        coEvery { mediaRepository.upload(listOf(item), "c-1", any()) } coAnswers {
            attempt++
            if (attempt == 1) return@coAnswers NetworkResult.Failure(ApiError("offline"))
            arg<(Long, Long) -> Unit>(2)(7L, 10L)
            seen += ledger.progress.value["cmid-1"]
            NetworkResult.Success(listOf(uploaded))
        }

        handler().send(chatRow())
        handler().send(chatRow())

        assertThat(seen).containsExactly(me.meeshy.sdk.model.media.MediaUploadProgress.Uploading(7L, 10L))
        assertThat(ledger.progress.value).isEmpty()
    }
}


package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.guest.GuestAttachmentRefusal
import me.meeshy.sdk.model.media.AttachmentGroupKind
import me.meeshy.sdk.model.media.OutgoingMediaGroup
import me.meeshy.sdk.model.media.PlannedMessage
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class MediaGroupUploaderTest {

    private fun group(kind: AttachmentGroupKind, ids: List<String>) =
        OutgoingMediaGroup(PlannedMessage(kind, ids, text = null, carriesReply = false), tempId = "cid_1")

    private fun piece(id: String, mime: String = "image/jpeg") =
        GroupUploadItem(id, MediaUploadItem(byteArrayOf(1, 2, 3), "$id.bin", mime))

    private fun media(id: String) = UploadedMedia(id, "https://cdn/$id", "image/jpeg", 3L, null, null, null, null)

    @Test
    fun `les identifiants serveur reviennent dans l'ordre du composeur, pas celui de fin d'envoi`() = runTest {
        val uploader = MediaGroupUploader(
            files = { item ->
                delay(if (item.attachmentId == "first") 100L else 10L)
                NetworkResult.Success(listOf(media("srv-${item.attachmentId}")))
            },
            progress = UploadProgressCenter(),
        )
        val promoted = mutableListOf<Pair<String, String>>()

        val uploaded = uploader.upload(
            group(AttachmentGroupKind.VISUAL, listOf("first", "second", "third")),
            listOf(piece("first"), piece("second"), piece("third")),
        ) { local, server -> promoted += local to server }

        assertThat(uploaded.attachmentIds).containsExactly("srv-first", "srv-second", "srv-third").inOrder()
        assertThat(promoted).containsExactly("first" to "srv-first", "second" to "srv-second", "third" to "srv-third")
    }

    @Test
    fun `le parallelisme est borne`() = runTest {
        val running = AtomicInteger(0)
        val peak = AtomicInteger(0)
        val uploader = MediaGroupUploader(
            files = { item ->
                peak.accumulateAndGet(running.incrementAndGet()) { a, b -> maxOf(a, b) }
                delay(50L)
                running.decrementAndGet()
                NetworkResult.Success(listOf(media(item.attachmentId)))
            },
            progress = UploadProgressCenter(),
            parallelism = 2,
        )

        uploader.upload(
            group(AttachmentGroupKind.VISUAL, listOf("a", "b", "c", "d", "e")),
            listOf("a", "b", "c", "d", "e").map(::piece),
        ) { _, _ -> }

        assertThat(peak.get()).isEqualTo(2)
    }

    @Test
    fun `un groupe audio part toujours en audio mp4`() = runTest {
        val sentMimes = mutableListOf<String>()
        val uploader = MediaGroupUploader(
            files = { item ->
                sentMimes += item.item.mimeType
                NetworkResult.Success(listOf(media(item.attachmentId)))
            },
            progress = UploadProgressCenter(),
        )

        uploader.upload(group(AttachmentGroupKind.AUDIO, listOf("v")), listOf(piece("v", "audio/x-m4a"))) { _, _ -> }

        assertThat(sentMimes).containsExactly("audio/mp4")
    }

    @Test
    fun `le refus d'une piece d'invite remonte type, jamais en echec ordinaire`() = runTest {
        val uploader = MediaGroupUploader(
            files = {
                NetworkResult.Failure(ApiError(message = "non", code = GuestAttachmentRefusal.Reason.TOO_LARGE.code, httpStatus = 413))
            },
            progress = UploadProgressCenter(),
        )

        val thrown = runCatching {
            uploader.upload(group(AttachmentGroupKind.VISUAL, listOf("a")), listOf(piece("a"))) { _, _ -> }
        }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(GuestAttachmentRefusedException::class.java)
        assertThat((thrown as GuestAttachmentRefusedException).refusal.reason).isEqualTo(GuestAttachmentRefusal.Reason.TOO_LARGE)
    }

    @Test
    fun `un echec ordinaire remonte en echec d'upload`() = runTest {
        val uploader = MediaGroupUploader(
            files = { NetworkResult.Failure(ApiError(message = "coupé", httpStatus = 503)) },
            progress = UploadProgressCenter(),
        )

        val thrown = runCatching {
            uploader.upload(group(AttachmentGroupKind.VISUAL, listOf("a")), listOf(piece("a"))) { _, _ -> }
        }.exceptionOrNull()

        assertThat(thrown).isInstanceOf(AttachmentUploadException::class.java)
        assertThat(thrown).hasMessageThat().isEqualTo("coupé")
    }

    @Test
    fun `la barre globale annonce chaque fichier avec son nom`() = runTest {
        val progress = UploadProgressCenter()
        val uploader = MediaGroupUploader(
            files = { item ->
                assertThat(progress.bar.value.files.map { it.fileName }).contains("${item.attachmentId}.bin")
                NetworkResult.Success(listOf(media(item.attachmentId)))
            },
            progress = progress,
        )

        uploader.upload(group(AttachmentGroupKind.VISUAL, listOf("a")), listOf(piece("a"))) { _, _ -> }
    }
}

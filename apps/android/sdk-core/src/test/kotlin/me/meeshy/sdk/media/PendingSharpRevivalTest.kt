package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.composer.AttachmentThumbnail
import me.meeshy.sdk.composer.AttachmentThumbnailing
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.LocalFileUrl
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #16013 — le processus meurt avant que la copie nette d'une photo en attente soit écrite : au démarrage, elle se refait
 * depuis la copie scellée, pour une pièce ordinaire seulement, et une seule fois.
 */
class PendingSharpRevivalTest {
    @get:Rule val folder = TemporaryFolder()

    private object NoThumbnails : AttachmentThumbnailing {
        override suspend fun thumbnail(file: File, type: PendingAttachmentType, outputDir: File, id: String): AttachmentThumbnail? = null
    }

    private class Sanitizer : SanitizedImageEncoding {
        val received = mutableListOf<ByteArray>()
        override fun encode(open: () -> java.io.InputStream, target: File): Boolean {
            received += open().use { it.readBytes() }
            target.parentFile?.mkdirs()
            target.writeBytes(SANITIZED)
            return true
        }
    }

    private val dir by lazy { File(folder.root, "pending-previews") }
    private val sanitizer = Sanitizer()
    private val previews by lazy { PendingMediaPreviews(dir, NoThumbnails, Dispatchers.Unconfined, sanitizer) }
    private val original = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0x45, 0x78, 0x69, 0x66, 9, 9)
    private val opened = mutableListOf<String>()

    private fun sealed(vararg cmids: String): suspend (String) -> MediaUploadItem? = { cmid ->
        opened += cmid
        if (cmid in cmids) MediaUploadItem.onDisk(folder.newFile().apply { writeBytes(original) }, "IMG.jpg", "image/jpeg") else null
    }

    private fun photo(id: String, flags: Long? = 0L, mime: String = "image/jpeg") = ApiMessageAttachment(
        id = id,
        mimeType = mime,
        fileUrl = null,
        thumbnailUrl = "file://" + File(dir, "$id.preview.jpg").absolutePath,
        effectFlags = flags,
    )

    private fun bubble(vararg attachments: ApiMessageAttachment) =
        ApiMessage(id = "cid_1", conversationId = "c1", createdAt = "2026-11-04T10:00:00Z", attachments = attachments.toList())

    private fun revival(bubbles: List<ApiMessage>, source: suspend (String) -> MediaUploadItem?) =
        PendingSharpRevival({ bubbles }, source, previews)

    @Test
    fun `a pending photo without its sharp copy gets it back from the sealed copy`() = runBlocking {
        revival(listOf(bubble(photo("cmid_1"))), sealed("cmid_1")).revive()

        val sharp = File(LocalFileUrl.pathOf(previews.sharpUrlFor("cmid_1")!!)!!)
        assertThat(sharp.readBytes()).isEqualTo(SANITIZED)
        assertThat(sanitizer.received.single()).isEqualTo(original)
    }

    @Test
    fun `a view-once, blurred or undeclared photo is never reopened`() = runBlocking {
        val bubbles = listOf(
            bubble(photo("cmid_1", flags = MessageEffectFlags.VIEW_ONCE)),
            bubble(photo("cmid_2", flags = MessageEffectFlags.BLURRED)),
            bubble(photo("cmid_3", flags = null)),
            bubble(photo("cmid_4").copy(isViewOnce = true)),
        )

        revival(bubbles, sealed("cmid_1", "cmid_2", "cmid_3", "cmid_4")).revive()

        assertThat(opened).isEmpty()
        assertThat(sanitizer.received).isEmpty()
        assertThat(dir.exists() && dir.listFiles().orEmpty().isNotEmpty()).isFalse()
    }

    @Test
    fun `a photo whose sharp copy is already there is not encoded again`() = runBlocking {
        File(dir.apply { mkdirs() }, "cmid_1.sharp.jpg").writeBytes(SANITIZED)

        revival(listOf(bubble(photo("cmid_1"))), sealed("cmid_1")).revive()

        assertThat(opened).isEmpty()
        assertThat(sanitizer.received).isEmpty()
    }

    @Test
    fun `a video, a voice note or a served photo is left alone`() = runBlocking {
        val bubbles = listOf(
            bubble(photo("cmid_1", mime = "video/mp4"), photo("cmid_2", mime = "audio/mp4")),
            bubble(photo("att_srv").copy(thumbnailUrl = "https://gate.meeshy.me/a.jpg", fileUrl = "https://gate.meeshy.me/a.jpg")),
        )

        revival(bubbles, sealed("cmid_1", "cmid_2", "att_srv")).revive()

        assertThat(opened).isEmpty()
        assertThat(sanitizer.received).isEmpty()
    }

    @Test
    fun `a photo whose sealed copy is gone does not stop the others`() = runBlocking {
        revival(listOf(bubble(photo("cmid_gone"), photo("cmid_2"))), sealed("cmid_2")).revive()

        assertThat(previews.sharpUrlFor("cmid_gone")).isNull()
        assertThat(previews.sharpUrlFor("cmid_2")).isNotNull()
    }

    private companion object {
        val SANITIZED = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 7, 7, 7)
    }
}

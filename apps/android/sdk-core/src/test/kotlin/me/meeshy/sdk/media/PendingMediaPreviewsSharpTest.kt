package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.composer.AttachmentThumbnail
import me.meeshy.sdk.composer.AttachmentThumbnailing
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.LocalFileUrl
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #15970 — une photo en attente s'ouvre nette en plein écran : sa copie pleine résolution est ASSAINIE (ré-encodée par
 * [SanitizedImageEncoding]), jamais l'original ; aucune pour une pièce protégée ; elle part avec l'aperçu.
 */
class PendingMediaPreviewsSharpTest {
    @get:Rule val folder = TemporaryFolder()

    private object NoThumbnails : AttachmentThumbnailing {
        override suspend fun thumbnail(file: File, type: PendingAttachmentType, outputDir: File, id: String): AttachmentThumbnail? = null
    }

    /** Le ré-encodage tel que la copie le voit : il reçoit les octets de la photo et écrit SA sortie, jamais eux. */
    private class Sanitizer(private val during: () -> Unit = {}) : SanitizedImageEncoding {
        val received = mutableListOf<ByteArray>()
        override fun encode(open: () -> java.io.InputStream, target: File): Boolean {
            received += open().use { it.readBytes() }
            during()
            target.parentFile?.mkdirs()
            target.writeBytes(SANITIZED)
            return true
        }
    }

    private val dir by lazy { File(folder.root, "pending-previews") }

    private fun previews(sanitizer: SanitizedImageEncoding) = PendingMediaPreviews(dir, NoThumbnails, Dispatchers.Unconfined, sanitizer)

    private val original = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0x45, 0x78, 0x69, 0x66, 1, 2, 3)

    private fun photo(): MediaUploadItem = MediaUploadItem.onDisk(folder.newFile().apply { writeBytes(original) }, "IMG_0001.jpg", "image/jpeg")

    private fun pathOf(url: String?): File = File(LocalFileUrl.pathOf(url!!)!!)

    @Test
    fun `a photo keeps a sanitized sharp copy the viewer finds by its upload`() = runBlocking {
        val sanitizer = Sanitizer()
        val previews = previews(sanitizer)

        previews.keepSharp("cmid_1", photo(), MessageEffects())

        val sharp = pathOf(previews.sharpUrlFor("cmid_1"))
        assertThat(sharp.parentFile?.canonicalPath).isEqualTo(dir.canonicalPath)
        assertThat(sharp.readBytes()).isEqualTo(SANITIZED)
        assertThat(sanitizer.received.single()).isEqualTo(original)
    }

    @Test
    fun `the original octets are never written to the cache`() = runBlocking {
        previews(Sanitizer()).keepSharp("cmid_1", photo(), MessageEffects())

        val written = dir.walkTopDown().filter { it.isFile }.map { it.readBytes() }.toList()
        assertThat(written.none { it.contentEquals(original) }).isTrue()
    }

    @Test
    fun `a view-once or blurred photo gets no copy at all`() = runBlocking {
        val sanitizer = Sanitizer()
        val previews = previews(sanitizer)

        previews.keepSharp("cmid_1", photo(), MessageEffects(flags = MessageEffectFlags.VIEW_ONCE))
        previews.keepSharp("cmid_2", photo(), MessageEffects(flags = MessageEffectFlags.BLURRED))

        assertThat(sanitizer.received).isEmpty()
        assertThat(previews.sharpUrlFor("cmid_1")).isNull()
        assertThat(previews.sharpUrlFor("cmid_2")).isNull()
        assertThat(dir.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `only a photo is copied — a video or a voice note never`() = runBlocking {
        val sanitizer = Sanitizer()
        val previews = previews(sanitizer)

        previews.keepSharp("cmid_1", MediaUploadItem(ByteArray(8), "clip.mp4", "video/mp4"), MessageEffects())
        previews.keepSharp("cmid_2", MediaUploadItem(ByteArray(8), "v.m4a", "audio/mp4"), MessageEffects())

        assertThat(sanitizer.received).isEmpty()
    }

    @Test
    fun `a copy is never asked under a name that leaves the directory`() = runBlocking {
        val sanitizer = Sanitizer()
        val previews = previews(sanitizer)

        previews.keepSharp("../escape", photo(), MessageEffects())

        assertThat(sanitizer.received).isEmpty()
        assertThat(previews.sharpUrlFor("../escape")).isNull()
    }

    @Test
    fun `the sharp copy leaves with its bubble`() = runBlocking {
        val previews = previews(Sanitizer())
        previews.keepSharp("cmid_1", photo(), MessageEffects())
        val sharp = pathOf(previews.sharpUrlFor("cmid_1"))

        previews.release(listOf(ApiMessageAttachment(id = "cmid_1", mimeType = "image/jpeg")))

        assertThat(sharp.exists()).isFalse()
        assertThat(previews.sharpUrlFor("cmid_1")).isNull()
    }

    @Test
    fun `a copy finished after its bubble left is not kept`() = runBlocking {
        lateinit var previews: PendingMediaPreviews
        previews = previews(
            Sanitizer(during = {
                runBlocking { previews.release(listOf(ApiMessageAttachment(id = "cmid_1", mimeType = "image/jpeg"))) }
            }),
        )

        previews.keepSharp("cmid_1", photo(), MessageEffects())

        assertThat(previews.sharpUrlFor("cmid_1")).isNull()
        assertThat(File(dir, "cmid_1.sharp.jpg").exists()).isFalse()
    }

    @Test
    fun `the account boundary empties the sharp copies`() = runBlocking {
        val previews = previews(Sanitizer())
        previews.keepSharp("cmid_1", photo(), MessageEffects())

        previews.clear()

        assertThat(previews.sharpUrlFor("cmid_1")).isNull()
    }

    private companion object {
        val SANITIZED = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 9, 9, 9)
    }
}

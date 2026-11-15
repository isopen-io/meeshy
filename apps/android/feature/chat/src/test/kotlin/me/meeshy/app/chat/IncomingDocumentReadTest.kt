package me.meeshy.app.chat

import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.InputStream
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/** #13585 : un document partagé par une autre app est copié en flux sous le plafond d'envoi d'un fichier, ou refusé sans rien laisser. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IncomingDocumentReadTest {
    private val context = ApplicationProvider.getApplicationContext<android.app.Application>()

    private fun register(uri: Uri, stream: InputStream) = shadowOf(context.contentResolver).registerInputStream(uri, stream)

    @Test
    fun `a pdf from another app is copied whole and named, its type coming from the name when the provider declares none`() {
        val uri = Uri.parse("content://com.example.docs/contrat.pdf")
        val pdf = "%PDF-1.7\n".toByteArray() + ByteArray(2048) { 1 }
        register(uri, ByteArrayInputStream(pdf))

        val picked = readPickedAttachment(context, uri)

        assertThat(picked).isNotNull()
        assertThat(picked!!.fileName).isEqualTo("contrat.pdf")
        assertThat(MimeTypeResolver.resolve(picked.mimeType ?: "*/*", picked.fileName)).isEqualTo("application/pdf")
        assertThat(picked.file.readBytes()).isEqualTo(pdf)
        MediaIntake.release(me.meeshy.sdk.media.MediaUploadItem.onDisk(picked.file, "contrat.pdf", "application/pdf"))
    }

    @Test
    fun `a document one octet over the send ceiling is refused and leaves no copy`() {
        val uri = Uri.parse("content://com.example.docs/enorme.pdf")
        val over = ComposerAttachmentLimits.MAX_UPLOAD_BYTES + 1
        var served = 0L
        val endless = object : InputStream() {
            override fun read(): Int = if (served++ < over) 0 else -1
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (served >= over) return -1
                val n = minOf(len.toLong(), over - served).toInt()
                served += n
                return n
            }
        }
        register(uri, endless)

        assertThat(readPickedAttachment(context, uri)).isNull()
        assertThat(MediaIntake.directory(context.cacheDir).listFiles().orEmpty()).isEmpty()
    }
}

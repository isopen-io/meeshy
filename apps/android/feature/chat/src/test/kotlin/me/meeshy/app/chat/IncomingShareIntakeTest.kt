package me.meeshy.app.chat

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.InputStream
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import me.meeshy.sdk.model.share.ShareLimits
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * #13585 : l'activité de partage accepte tout type, donc ce qu'elle LIT est jugé ici — quelles URI de l'intent,
 * combien, sous quel nom — et ce qu'elle écarte est DIT à l'utilisateur, comme l'extension iOS (`ShareShortfall`).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IncomingShareIntakeTest {
    private val context = ApplicationProvider.getApplicationContext<android.app.Application>()
    private val otherApp = { uri: Uri -> uri.scheme == "content" && uri.authority == "com.example.docs" }

    private fun doc(index: Int) = Uri.parse("content://com.example.docs/$index.pdf")

    @Test
    fun `a single stream from a file path is refused and counted, never read`() {
        val intent = Intent(Intent.ACTION_SEND).setType("*/*").putExtra(Intent.EXTRA_STREAM, Uri.parse("file:///data/data/me.meeshy.app/shared_prefs/session.xml"))

        val selection = IncomingShareSelection.of(intent, otherApp)

        assertThat(selection.admitted).isEmpty()
        assertThat(selection.refused).isEqualTo(1)
    }

    @Test
    fun `a multiple share keeps the other app's documents in order and counts what it refuses`() {
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*")
            .putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(doc(1), Uri.parse("file:///sdcard/x.pdf"), Uri.parse("content://me.meeshy.app.fileprovider/cache/a"), doc(2)))

        val selection = IncomingShareSelection.of(intent, otherApp)

        assertThat(selection.admitted).containsExactly(doc(1), doc(2)).inOrder()
        assertThat(selection.refused).isEqualTo(2)
        assertThat(selection.overflow).isEqualTo(0)
    }

    @Test
    fun `beyond the per-share file ceiling nothing more is even judged and the overflow is counted`() {
        val streams = (1..ShareLimits.MAX_FILES + 30).map(::doc)
        var judged = 0
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(streams))

        val selection = IncomingShareSelection.of(intent) { judged++; otherApp(it) }

        assertThat(selection.admitted).hasSize(ShareLimits.MAX_FILES)
        assertThat(selection.overflow).isEqualTo(30)
        assertThat(judged).isEqualTo(ShareLimits.MAX_FILES)
    }

    @Test
    fun `a uri carried only by clip data or by the text is never read as a file`() {
        val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "content://com.example.docs/1.pdf")
        intent.clipData = ClipData.newRawUri("x", doc(3))

        val selection = IncomingShareSelection.of(intent, otherApp)

        assertThat(selection.admitted).isEmpty()
        assertThat(selection.refused).isEqualTo(0)
    }

    @Test
    fun `a malformed stream extra is no stream at all`() {
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*").putExtra(Intent.EXTRA_STREAM, "pas une liste")

        assertThat(IncomingShareSelection.of(intent, otherApp)).isEqualTo(IncomingShareSelection(emptyList(), 0, 0))
    }

    @Test
    fun `a document over the send ceiling is reported by name and leaves no copy`() {
        val uri = Uri.parse("content://com.example.docs/rapport-annuel.pdf")
        shadowOf(context.contentResolver).registerInputStream(uri, endless(ComposerAttachmentLimits.MAX_UPLOAD_BYTES + 1))

        assertThat(readIncomingAttachment(context, uri)).isEqualTo(IncomingRead.TooLarge("rapport-annuel.pdf"))
        assertThat(MediaIntake.directory(context.cacheDir).listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `an empty or unopenable document is unreadable and leaves no copy`() {
        val empty = Uri.parse("content://com.example.docs/vide.pdf")
        shadowOf(context.contentResolver).registerInputStream(empty, ByteArrayInputStream(ByteArray(0)))

        assertThat(readIncomingAttachment(context, empty)).isEqualTo(IncomingRead.Unreadable)
        assertThat(readIncomingAttachment(context, Uri.parse("content://com.example.docs/absent.pdf"))).isEqualTo(IncomingRead.Unreadable)
        assertThat(MediaIntake.directory(context.cacheDir).listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `a document's announced name travels cleaned like the ios extension's`() {
        val uri = Uri.parse("content://com.example.docs/..%2F..%2Fcontrat%E2%80%AEfdp.exe")
        shadowOf(context.contentResolver).registerInputStream(uri, ByteArrayInputStream("%PDF-1.7".toByteArray()))

        val read = readIncomingAttachment(context, uri) as IncomingRead.Copied

        assertThat(read.item.fileName).isEqualTo("contratfdp.exe")
        MediaIntake.release(read.item)
    }

    @Test
    fun `a hostile file name keeps only its last component, without control or bidi characters, capped with its extension`() {
        assertThat(IncomingFileName.sanitized("../../etc/passwd", "application/pdf")).isEqualTo("passwd.pdf")
        assertThat(IncomingFileName.sanitized("..\\..\\boot.ini", "application/octet-stream")).isEqualTo("boot.ini")
        assertThat(IncomingFileName.sanitized("photo‮gpj.exe", "image/jpeg")).isEqualTo("photogpj.exe")
        assertThat(IncomingFileName.sanitized("a\u0000b\u0007‏c.jpg", "image/jpeg")).isEqualTo("abc.jpg")
        assertThat(IncomingFileName.sanitized("12:30 réunion.png", "image/png")).isEqualTo("12_30 réunion.png")
        assertThat(IncomingFileName.sanitized("...  .pdf", "application/pdf")).isEqualTo("pdf.pdf")
        assertThat(IncomingFileName.sanitized("‮", "application/pdf")).isNull()
        val long = IncomingFileName.sanitized("é".repeat(400) + ".docx", "application/octet-stream")!!
        assertThat(long).endsWith(".docx")
        assertThat(long.toByteArray(Charsets.UTF_8).size).isAtMost(IncomingFileName.MAX_BYTES)
    }

    @Test
    fun `what the share leaves behind is said once per kind, never once per file`() {
        val reads = listOf(IncomingRead.TooLarge("a.pdf"), IncomingRead.Unreadable, IncomingRead.Unreadable, IncomingRead.TooLarge("b.mov"))

        assertThat(IncomingShortfall.of(reads, IncomingShareSelection(emptyList(), refused = 2, overflow = 3))).containsExactly(
            IncomingShortfall.RefusedSource,
            IncomingShortfall.OverBudget(uncopied = 3),
            IncomingShortfall.TooLarge(listOf("a.pdf", "b.mov")),
            IncomingShortfall.Unprepared,
        ).inOrder()
        assertThat(IncomingShortfall.of(emptyList(), IncomingShareSelection(emptyList(), 0, 0))).isEmpty()
    }

    private fun endless(total: Long): InputStream = object : InputStream() {
        var served = 0L
        override fun read(): Int = if (served++ < total) 0 else -1
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (served >= total) return -1
            val n = minOf(len.toLong(), total - served).toInt()
            served += n
            return n
        }
    }
}

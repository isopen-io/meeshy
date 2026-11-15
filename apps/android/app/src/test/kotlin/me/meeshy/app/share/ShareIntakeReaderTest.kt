package me.meeshy.app.share

import android.content.Intent
import android.net.Uri
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.share.ShareLimits
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ShareIntakeReaderTest {
    private val reader = ShareIntakeReader { it.scheme == "content" && it.authority != "me.meeshy.app.fileprovider" }

    private fun uri(path: String) = Uri.parse(path)

    @Test
    fun `a single send carries its stream`() {
        val photo = uri("content://com.google.android.apps.photos.contentprovider/1/photo")
        val intent = Intent(Intent.ACTION_SEND).setType("image/jpeg").putExtra(Intent.EXTRA_STREAM, photo)

        val batch = reader.read(intent)

        assertThat(batch.admitted).containsExactly(photo)
        assertThat(batch.text).isNull()
        assertThat(batch.declaredMime).isEqualTo("image/jpeg")
    }

    @Test
    fun `a multiple send keeps the sender's order`() {
        val first = uri("content://com.example.docs/a.pdf")
        val second = uri("content://com.example.docs/b.pdf")
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*")
            .putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(first, second))

        assertThat(reader.read(intent).admitted).containsExactly(first, second).inOrder()
    }

    @Test
    fun `a file path is refused and counted so the user is told`() {
        val path = uri("file:///sdcard/Download/contrat.pdf")
        val intent = Intent(Intent.ACTION_SEND).setType("*/*").putExtra(Intent.EXTRA_STREAM, path)

        val batch = reader.read(intent)

        assertThat(batch.admitted).isEmpty()
        assertThat(batch.refused).isEqualTo(1)
        assertThat(batch.isEmpty).isFalse()
    }

    @Test
    fun `our own provider is never read back`() {
        val own = uri("content://me.meeshy.app.fileprovider/cache/x")
        val intent = Intent(Intent.ACTION_SEND).setType("*/*").putExtra(Intent.EXTRA_STREAM, own)

        assertThat(reader.read(intent).refused).isEqualTo(1)
    }

    @Test
    fun `a browser link is a link even when a thumbnail rides along`() {
        val thumbnail = uri("content://com.android.chrome.fileprovider/thumb.png")
        val intent = Intent(Intent.ACTION_SEND).setType("image/png")
            .putExtra(Intent.EXTRA_TEXT, "https://youtu.be/abc123")
            .putExtra(Intent.EXTRA_STREAM, thumbnail)

        val batch = reader.read(intent)

        assertThat(batch.text).isEqualTo("https://youtu.be/abc123")
        assertThat(batch.admitted).isEmpty()
        assertThat(batch.refused).isEqualTo(0)
    }

    @Test
    fun `a plain text share carries its text`() {
        val intent = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "  rendez-vous à 18h  ")

        val batch = reader.read(intent)

        assertThat(batch.text).isEqualTo("rendez-vous à 18h")
        assertThat(batch.admitted).isEmpty()
    }

    @Test
    fun `a photo with a caption keeps both`() {
        val photo = uri("content://com.example.gallery/1")
        val intent = Intent(Intent.ACTION_SEND).setType("image/jpeg")
            .putExtra(Intent.EXTRA_TEXT, "Regarde cette vue")
            .putExtra(Intent.EXTRA_STREAM, photo)

        val batch = reader.read(intent)

        assertThat(batch.text).isEqualTo("Regarde cette vue")
        assertThat(batch.admitted).containsExactly(photo)
    }

    @Test
    fun `streams past the file cap are counted as overflow`() {
        val streams = ArrayList((0 until ShareLimits.MAX_FILES + 3).map { uri("content://com.example.docs/$it") })
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).setType("*/*").putParcelableArrayListExtra(Intent.EXTRA_STREAM, streams)

        val batch = reader.read(intent)

        assertThat(batch.admitted).hasSize(ShareLimits.MAX_FILES)
        assertThat(batch.overflow).isEqualTo(3)
    }

    @Test
    fun `any other action reads as nothing`() {
        val intent = Intent(Intent.ACTION_VIEW).putExtra(Intent.EXTRA_TEXT, "salut")

        assertThat(reader.read(intent).isEmpty).isTrue()
        assertThat(reader.read(null).isEmpty).isTrue()
    }
}

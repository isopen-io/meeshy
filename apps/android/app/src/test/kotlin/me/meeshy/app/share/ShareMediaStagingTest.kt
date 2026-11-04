package me.meeshy.app.share

import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import me.meeshy.sdk.model.share.ShareStagingBudget
import me.meeshy.sdk.model.share.ShareStagingError
import me.meeshy.sdk.model.share.ShareStagingPolicy
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class ShareMediaStagingTest {
    @get:Rule val folder = TemporaryFolder()
    private val context = ApplicationProvider.getApplicationContext<android.app.Application>()
    private val mib = 1024L * 1024L

    private fun staging(budget: ShareStagingBudget = ShareStagingBudget(), free: Long = Long.MAX_VALUE) =
        ShareMediaStaging(context.contentResolver, { File(folder.root, it) }, budget, { free })

    private fun register(uri: Uri, stream: InputStream) = shadowOf(context.contentResolver).registerInputStream(uri, stream)

    /** Un flux de [size] octets qui n'existe nulle part : rien n'est alloué, et la plus grande lecture demandée est notée. */
    private class VirtualStream(private val size: Long) : InputStream() {
        var served = 0L
        var largestRequest = 0
        override fun read(): Int = if (served >= size) -1 else { served++; 0 }
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            largestRequest = maxOf(largestRequest, len)
            if (served >= size) return -1
            val n = minOf(len.toLong(), size - served).toInt()
            served += n
            return n
        }
    }

    @Test
    fun `a video is copied by slices of 64 KiB and arrives whole`() {
        val uri = Uri.parse("content://com.example.gallery/video.mp4")
        val stream = VirtualStream(3 * mib + 5)
        register(uri, stream)

        val result = staging().stage(uri, "share1", 0, "video/mp4")

        val media = result.outcome.getOrThrow()
        assertThat(media.bytes).isEqualTo(3 * mib + 5)
        assertThat(media.mime).isEqualTo("video/mp4")
        assertThat(media.relPath).isEqualTo("share1/0.mp4")
        assertThat(File(folder.root, "share1/0.mp4").length()).isEqualTo(3 * mib + 5)
        assertThat(stream.largestRequest).isAtMost(ShareStagingPolicy.COPY_BUFFER_BYTES)
    }

    @Test
    fun `a 600 MB stream goes through a 64 KiB buffer without ever being held`() {
        val stream = VirtualStream(600 * mib)
        var largest = 0L

        val written = ShareMediaStaging.streamCopy(stream, object : OutputStream() {
            override fun write(b: Int) = Unit
            override fun write(b: ByteArray, off: Int, len: Int) { largest = maxOf(largest, len.toLong()) }
        }) { }

        assertThat(written).isEqualTo(600 * mib)
        assertThat(largest).isAtMost(64L * 1024L)
        assertThat(stream.largestRequest).isAtMost(64 * 1024)
    }

    @Test
    fun `a stream past the budget stops at the first excess slice and leaves nothing behind`() {
        val budget = ShareStagingBudget(maxBytes = 8 * mib, maxFiles = 20)
        val uri = Uri.parse("content://com.example.gallery/huge.mp4")
        val stream = VirtualStream(600 * mib)
        register(uri, stream)

        val result = staging(budget).stage(uri, "share2", 0, "video/mp4")

        assertThat(result.error).isInstanceOf(ShareStagingError.ByteBudgetExceeded::class.java)
        assertThat(stream.served).isLessThan(9 * mib)
        assertThat(File(folder.root, "share2/0.mp4").exists()).isFalse()
        assertThat(budget.reservedBytes).isEqualTo(0L)
        assertThat(budget.reservedFiles).isEqualTo(0)
    }

    @Test
    fun `the file count cap refuses the surplus without copying it`() {
        val budget = ShareStagingBudget(maxBytes = 100 * mib, maxFiles = 1)
        val first = Uri.parse("content://com.example.gallery/a.png")
        val second = Uri.parse("content://com.example.gallery/b.png")
        register(first, ByteArrayInputStream(ByteArray(10) { 1 }))
        register(second, ByteArrayInputStream(ByteArray(10) { 2 }))
        val staging = staging(budget)

        val kept = staging.stage(first, "share3", 0, "image/png")
        val surplus = staging.stage(second, "share3", 1, "image/png")

        assertThat(kept.error).isNull()
        assertThat(surplus.error).isInstanceOf(ShareStagingError.FileCountExceeded::class.java)
        assertThat(File(folder.root, "share3/1.png").exists()).isFalse()
    }

    @Test
    fun `a disk short of the 128 MiB margin refuses before the first byte`() {
        val uri = Uri.parse("content://com.example.gallery/clip.mp4")
        register(uri, VirtualStream(mib))

        val result = staging(free = 64 * mib).stage(uri, "share4", 0, "video/mp4")

        assertThat(result.error).isInstanceOf(ShareStagingError.InsufficientFreeSpace::class.java)
        assertThat(File(folder.root, "share4/0.mp4").exists()).isFalse()
    }

    @Test
    fun `a provider that fails mid-copy leaves no partial file and no reservation`() {
        val budget = ShareStagingBudget()
        val uri = Uri.parse("content://com.example.gallery/broken.jpg")
        register(uri, object : InputStream() {
            private var calls = 0
            override fun read(): Int = throw IOException("révoqué")
            override fun read(b: ByteArray, off: Int, len: Int): Int =
                if (calls++ == 0) len.also { b.fill(1, off, off + len) } else throw IOException("révoqué")
        })

        val result = staging(budget).stage(uri, "share5", 0, "image/jpeg")

        assertThat(result.error).isInstanceOf(ShareStagingError.CopyFailed::class.java)
        assertThat(File(folder.root, "share5/0.jpg").exists()).isFalse()
        assertThat(budget.reservedBytes).isEqualTo(0L)
        assertThat(budget.reservedFiles).isEqualTo(0)
    }

    @Test
    fun `the sender's name travels as sanitized metadata and never as the path`() {
        val uri = Uri.parse("content://com.example.docs/contrat.pdf")
        register(uri, ByteArrayInputStream(ByteArray(32) { 7 }))

        val media = staging().stage(uri, "share6", 3, null).outcome.getOrThrow()

        assertThat(media.relPath).isEqualTo("share6/3.pdf")
        assertThat(media.mime).isEqualTo("application/pdf")
        assertThat(media.originalName).isEqualTo("contrat.pdf")
        assertThat(media.uploadFileName).isEqualTo("contrat.pdf")
    }

    @Test
    fun `an empty file is not a share`() {
        val uri = Uri.parse("content://com.example.docs/vide.pdf")
        register(uri, ByteArrayInputStream(ByteArray(0)))

        val result = staging().stage(uri, "share7", 0, "application/pdf")

        assertThat(result.error).isInstanceOf(ShareStagingError.CopyFailed::class.java)
        assertThat(File(folder.root, "share7/0.pdf").exists()).isFalse()
    }
}

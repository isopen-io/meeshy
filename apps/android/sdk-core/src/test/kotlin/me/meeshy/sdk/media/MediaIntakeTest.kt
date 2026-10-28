package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.InputStream

/** #13553 — un média choisi se copie EN FLUX dans le cache privé : aucun tableau de sa taille, borne appliquée pendant la copie. */
class MediaIntakeTest {
    @get:Rule val folder = TemporaryFolder()

    private fun zeros(size: Long): InputStream = object : InputStream() {
        private var left = size
        override fun read(): Int = if (left-- > 0) 0 else -1
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (left <= 0) return -1
            val n = minOf(len.toLong(), left).toInt()
            left -= n
            return n
        }
    }

    @Test
    fun `a 200 MB video is copied to a private file allocating a few MB only`() {
        val cache = folder.newFolder()
        var item: MediaUploadItem? = null

        val allocated = AllocationMeter.allocatedBy {
            item = MediaIntake.copy(zeros(200L * 1024 * 1024), cache, "clip.mp4", "video/mp4")
        }

        assertThat(item!!.sizeBytes).isEqualTo(200L * 1024 * 1024)
        assertThat(item!!.source).isInstanceOf(MediaUploadSource.OnDisk::class.java)
        assertThat(allocated).isLessThan(4L * 1024 * 1024)
    }

    @Test
    fun `a stream over the bound stops during the copy and leaves nothing on disk`() {
        val cache = folder.newFolder()

        val item = MediaIntake.copy(zeros(10_000), cache, "a.bin", "application/octet-stream", maxBytes = 4_096)

        assertThat(item).isNull()
        assertThat(MediaIntake.directory(cache).listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `releasing an item deletes its copy and spares a file that is not an intake copy`() {
        val cache = folder.newFolder()
        val copy = MediaIntake.copy(zeros(10), cache, "a", "image/png")!!
        val foreign = MediaUploadItem.onDisk(folder.newFile("x"), "x", "image/png")

        MediaIntake.release(copy)
        MediaIntake.release(foreign)

        assertThat(MediaIntake.directory(cache).listFiles().orEmpty()).isEmpty()
        assertThat((foreign.source as MediaUploadSource.OnDisk).file.exists()).isTrue()
    }

    @Test
    fun `a forgotten copy is swept after a day and the teardown removes the rest`() = runTest {
        val cache = folder.newFolder()
        val old = (MediaIntake.copy(zeros(10), cache, "a", "image/png")!!.source as MediaUploadSource.OnDisk).file
        old.setLastModified(System.currentTimeMillis() - MediaIntake.TTL_MS - 1_000)
        val fresh = (MediaIntake.copy(zeros(10), cache, "b", "image/png")!!.source as MediaUploadSource.OnDisk).file

        assertThat(old.exists()).isFalse()
        assertThat(fresh.exists()).isTrue()
        MediaIntake.clear(cache)
        assertThat(fresh.exists()).isFalse()
    }

    @Test
    fun `the preview model of a file item is the file itself`() {
        val cache = folder.newFolder()
        val item = MediaIntake.copy(zeros(10), cache, "a", "image/png")!!

        assertThat(item.previewModel).isEqualTo((item.source as MediaUploadSource.OnDisk).file)
        assertThat(MediaUploadItem(ByteArray(3), "b", "image/png").previewModel).isInstanceOf(ByteArray::class.java)
    }
}

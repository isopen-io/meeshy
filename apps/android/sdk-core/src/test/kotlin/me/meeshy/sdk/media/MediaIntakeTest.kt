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
    fun `a provider stream that throws something other than an io error is unreadable and leaves nothing on disk`() {
        val cache = folder.newFolder()
        val hostile = object : InputStream() {
            override fun read(): Int = throw UnsupportedOperationException("fournisseur hostile")
        }

        assertThat(MediaIntake.copy(hostile, cache, "a.pdf", "application/pdf")).isNull()
        assertThat(MediaIntake.directory(cache).listFiles().orEmpty()).isEmpty()
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

    @Test
    fun `a provider name that climbs the tree only rides as metadata, never as the path`() {
        val cache = folder.newFolder()
        val escaped = File(MediaIntake.directory(cache), "../../shared_prefs/x.xml").canonicalFile
        val recorded = folder.newFile("voice.m4a").apply { writeBytes(byteArrayOf(4, 5)) }

        val copied = MediaIntake.copy(zeros(10), cache, "../../shared_prefs/x.xml", "image/png")!!
        val adopted = MediaIntake.adopt(recorded, cache, "../../shared_prefs/x.xml", "audio/mp4")!!

        listOf(copied, adopted).forEach { item ->
            val file = (item.source as MediaUploadSource.OnDisk).file
            assertThat(file.canonicalFile.parentFile).isEqualTo(MediaIntake.directory(cache).canonicalFile)
            assertThat(item.fileName).isEqualTo("../../shared_prefs/x.xml")
        }
        assertThat(escaped.exists()).isFalse()
    }
}

/** #13606 — la durée d'une vidéo se sonde à la prise, pour que la file hors ligne la garde. */
class MediaIntakeDurationTest {
    @get:Rule val folder = TemporaryFolder()

    private fun bytes() = java.io.ByteArrayInputStream(ByteArray(64))

    @Test
    fun `a picked video keeps the duration probed from its private copy`() {
        val item = MediaIntake.copy(bytes(), folder.newFolder(), "v.mp4", "video/mp4", durationProbe = { file, _ -> if (file.isFile) 12_000L else null })

        assertThat(item!!.durationMs).isEqualTo(12_000L)
    }

    @Test
    fun `a sound is never probed, so ending a voice note does no extra file read`() {
        var probed = false
        val file = folder.newFile("take.m4a").also { it.writeBytes(ByteArray(8)) }

        val item = MediaIntake.adopt(file, folder.newFolder(), "take.m4a", "audio/mp4")
        MediaIntake.copy(bytes(), folder.newFolder(), "a.m4a", "audio/mp4", durationProbe = { _, _ -> probed = true; 1L })

        assertThat(probed).isFalse()
        assertThat(item!!.durationMs).isNull()
    }

    @Test
    fun `an image is never probed`() {
        var probed = false
        val item = MediaIntake.copy(bytes(), folder.newFolder(), "a.jpg", "image/jpeg", durationProbe = { _, _ -> probed = true; 1L })

        assertThat(probed).isFalse()
        assertThat(item!!.durationMs).isNull()
    }

    @Test
    fun `a probe that fails leaves the item without duration`() {
        val item = MediaIntake.copy(bytes(), folder.newFolder(), "v.mp4", "video/mp4", durationProbe = { _, _ -> error("codec") })

        assertThat(item).isNotNull()
        assertThat(item!!.durationMs).isNull()
    }

    @Test
    fun `a non positive probed duration is dropped`() {
        val item = MediaIntake.copy(bytes(), folder.newFolder(), "v.mp4", "video/mp4", durationProbe = { _, _ -> 0L })

        assertThat(item!!.durationMs).isNull()
    }
}

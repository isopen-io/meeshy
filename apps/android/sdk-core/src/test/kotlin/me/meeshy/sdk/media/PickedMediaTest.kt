package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PickedMediaTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun stage(name: String?, bytes: ByteArray = byteArrayOf(1, 2, 3), cache: File = tmp.root) =
        PickedMedia.stage(bytes.inputStream(), cache, name)

    @Test
    fun `deux copies du meme fichier portent deux noms distincts`() {
        val first = stage("a.jpg")
        val second = stage("a.jpg")
        assertThat(first.name).isNotEqualTo(second.name)
        assertThat(first.name).startsWith(PickedMedia.FILE_PREFIX)
    }

    @Test
    fun `l'extension du conteneur est gardee en minuscules`() {
        assertThat(stage("clip.MOV").extension).isEqualTo("mov")
        assertThat(stage("photo.HeIc").extension).isEqualTo("heic")
    }

    @Test
    fun `sans extension on retombe sur mov`() {
        assertThat(stage("sans_extension").extension).isEqualTo("mov")
        assertThat(stage(null).extension).isEqualTo("mov")
    }

    @Test
    fun `une extension douteuse n'est pas reprise dans le chemin`() {
        assertThat(PickedMedia.extensionOf("a.b/../c")).isEqualTo("mov")
        assertThat(PickedMedia.extensionOf("a.${"x".repeat(20)}")).isEqualTo("mov")
    }

    @Test
    fun `le contenu est copie tel quel`() {
        val bytes = ByteArray(200_000) { (it % 251).toByte() }
        assertThat(stage("a.jpg", bytes).readBytes()).isEqualTo(bytes)
    }

    @Test
    fun `une copie ratee ne laisse aucun fichier`() {
        val failing = object : InputStream() {
            var calls = 0
            override fun read(): Int = throw IOException("boom")
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (calls++ == 0) { b[off] = 9; return 1 }
                throw IOException("boom")
            }
        }
        assertThrows(IOException::class.java) { PickedMedia.stage(failing, tmp.root, "a.mov") }
        assertThat(PickedMedia.directory(tmp.root).listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `les orphelins d'avant le lancement sont purges, les copies du processus restent`() {
        val orphan = stage("old.jpg").also { it.setLastModified(1_000L) }
        val fresh = stage("new.jpg").also { it.setLastModified(9_000L) }
        val removed = PickedMedia.sweepOrphans(tmp.root, processStartedAt = 5_000L)
        assertThat(removed).isEqualTo(1)
        assertThat(orphan.exists()).isFalse()
        assertThat(fresh.exists()).isTrue()
    }

    @Test
    fun `la purge ne touche que les fichiers picked`() {
        val dir = PickedMedia.directory(tmp.root).also { it.mkdirs() }
        val stranger = File(dir, "autre.bin").also { it.writeText("x"); it.setLastModified(1L) }
        assertThat(PickedMedia.sweepOrphans(tmp.root, 5_000L)).isEqualTo(0)
        assertThat(stranger.exists()).isTrue()
    }
}

package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import me.meeshy.ui.component.retouch.RetouchVideoProbe
import org.junit.Test

/** Ce que « Terminé » téléverse d'une vidéo prise pour un post (#12735). */
class FeedVideoRetouchDeliveryTest {

    private fun pending(): FeedVideoRetouchPending {
        val dir = Files.createTempDirectory("feed_video").toFile()
        val source = File(dir, "source.mp4").apply { writeBytes(byteArrayOf(1, 2, 3)) }
        return FeedVideoRetouchPending(source, File(dir, "rendu.mp4"), RetouchVideoProbe(3.0, 1080, 1920, true), "video_1700000000000.mp4")
    }

    @Test
    fun `une video intouchee se televerse telle quelle, sous son nom de prise`() {
        val waiting = pending()
        val item = FeedVideoRetouchDelivery.item(waiting, waiting.source)!!
        assertThat(item.bytes).isEqualTo(byteArrayOf(1, 2, 3))
        assertThat(item.fileName).isEqualTo("video_1700000000000.mp4")
        assertThat(item.mimeType).isEqualTo(FeedVideoRetouchDelivery.VIDEO_MIME)
    }

    @Test
    fun `une video retouchee se televerse depuis son rendu, sous un nom de retouche`() {
        val waiting = pending()
        waiting.output.writeBytes(byteArrayOf(9, 9))
        val item = FeedVideoRetouchDelivery.item(waiting, waiting.output)!!
        assertThat(item.bytes).isEqualTo(byteArrayOf(9, 9))
        assertThat(item.fileName).isEqualTo("video_1700000000000_retouche.mp4")
    }

    @Test
    fun `un rendu vide ou absent ne part pas, et la retouche abandonnee efface ses deux fichiers`() {
        val waiting = pending()
        assertThat(FeedVideoRetouchDelivery.item(waiting, waiting.output)).isNull()
        waiting.output.writeBytes(byteArrayOf(1))
        waiting.discard()
        assertThat(waiting.source.exists()).isFalse()
        assertThat(waiting.output.exists()).isFalse()
    }
}

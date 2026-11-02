package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14088 — la relecture d'un export ne décode chaque image de vidéo qu'une fois : l'image entière et chaque région d'un
 * même instant se mesurent sur le même décodage, et la fin de la relecture ferme les lecteurs et oublie les images.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneVideoFrameReadingsTest {

    private class CountingSource : SceneVideoFrameSource {
        val decoded = mutableListOf<Pair<String, Long>>()
        var closed = 0

        override fun frameAt(file: File, atMillis: Long): Bitmap {
            decoded += file.name to atMillis
            return Bitmap.createBitmap(1080, 1920, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(200, 40, 40)) }
        }

        override fun close() {
            closed++
        }
    }

    private val rendered = File("meeshy-scene.mp4")

    private fun job() = SceneExportJob(
        plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 3_000)), emptyList(), still = false),
        format = StoryExportVideoFormat.of(),
        fills = listOf(SceneExportSlideFill.Picture(File("fond.png"))),
        overlays = emptyList(),
        sounds = emptyMap(),
        output = rendered,
    )
    private val left = SceneRegion(0f, 0f, 0.5f, 0.5f)
    private val right = SceneRegion(0.5f, 0.5f, 1f, 1f)

    @Test
    fun `one instant of one video is decoded once for the whole frame and every region`() {
        val source = CountingSource()
        val luma = AndroidSceneContentLuma(source)

        luma.videoFrame(rendered, 1_000)
        val first = luma.videoRegion(rendered, 1_000, left)
        luma.videoRegion(rendered, 1_000, right)
        luma.videoRegion(rendered, 3_000, left)

        assertThat(source.decoded).containsExactly("meeshy-scene.mp4" to 1_000L, "meeshy-scene.mp4" to 3_000L).inOrder()
        assertThat(first!!.red).isWithin(2f).of(200f)
        assertThat(first.green).isWithin(2f).of(40f)
    }

    @Test
    fun `the end of the reading closes the readers and forgets the frames`() {
        val source = CountingSource()
        val luma = AndroidSceneContentLuma(source)
        luma.videoFrame(rendered, 1_000)

        luma.release()
        luma.videoFrame(rendered, 1_000)

        assertThat(source.closed).isEqualTo(1)
        assertThat(source.decoded).hasSize(2)
    }

    @Test
    fun `the proof releases what it measured, even when the video fails it`() {
        var released = 0
        val luma = object : SceneContentLuma {
            override fun image(file: File): Int? = null
            override fun bitmap(bitmap: Bitmap): Int = 0
            override fun videoFrame(file: File, atMillis: Long): Int? = null
            override fun release() {
                released++
            }
        }

        runCatching { kotlinx.coroutines.runBlocking { RenderedContentProof(luma).verify(job()) } }

        assertThat(released).isEqualTo(1)
    }
}

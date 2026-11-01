package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14187 — recette S8 : un clip de 6 s se rendait en 6 s, puis sa relecture durait 9,5 s. Chaque instant relu ouvrait un
 * décodeur, repartait de l'image clé précédente et convertissait l'image pleine, pour le rendu comme pour la vidéo de fond.
 * La relecture lit désormais chaque fichier en UN passage : un décodeur par fichier, chaque image n'en sort qu'une fois, et
 * seules les images relues se convertissent ; ce qu'elle prouve ne change pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SequentialSceneVideoFramesTest {

    /** Un fichier de [count] images, une toutes les 33 ms, qui rend TOUJOURS le même bitmap, comme le décodeur de l'appareil. */
    private class Clip(private val count: Int = 181, private val shade: Int = 200) : VideoFrameDecoder {
        var cursor = 0
        var decoded = 0
        val rendered = mutableListOf<Long>()
        var released = false
        private val target = Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888)

        override fun seekTo(sourceMillis: Long) {
            cursor = (sourceMillis / STEP).toInt().coerceIn(0, count)
        }

        override fun next(): DecodedVideoFrame? {
            if (cursor >= count) return null
            val millis = cursor * STEP
            cursor++
            decoded++
            return object : DecodedVideoFrame {
                override val presentationMillis = millis
                override fun render(): Bitmap = target.apply { eraseColor(Color.rgb(shade, (millis / 40).toInt(), 0)) }.also { rendered += millis }
                override fun release() {}
            }
        }

        override fun release() {
            released = true
            target.recycle()
        }
    }

    private class Opener(private val refuses: Set<String> = emptySet()) {
        val clips = mutableMapOf<String, Clip>()
        val opened = mutableListOf<String>()

        fun open(file: File): VideoFrameDecoder {
            opened += file.name
            if (file.name in refuses) error("aucune piste vidéo dans ${file.name}")
            return Clip().also { clips[file.name] = it }
        }
    }

    private class Fallback : SceneVideoFrameSource {
        val asked = mutableListOf<Pair<String, Long>>()
        var closed = 0

        override fun frameAt(file: File, atMillis: Long): Bitmap =
            Bitmap.createBitmap(2, 2, Bitmap.Config.ARGB_8888).also { asked += file.name to atMillis }

        override fun close() {
            closed++
        }
    }

    private val rendered = File("meeshy-scene.mp4")
    private val background = File("20261101_052200.mp4")
    private val instants = SceneExportContent.sampleTimes(6_000)

    @Test
    fun `six instants of two six-second videos open one decoder per file and take each frame out of it once`() {
        val opener = Opener()
        val frames = SequentialSceneVideoFrames(opener::open, Fallback())

        instants.forEach { at ->
            frames.frameAt(background, at)
            frames.frameAt(rendered, at)
        }

        assertThat(opener.opened).containsExactly(background.name, rendered.name).inOrder()
        opener.clips.values.forEach { clip ->
            assertThat(clip.decoded).isAtMost(181)
            assertThat(clip.rendered).hasSize(6)
        }
    }

    @Test
    fun `an instant serves the last frame at or before it`() {
        val opener = Opener()
        val frames = SequentialSceneVideoFrames(opener::open, Fallback())

        instants.forEach { frames.frameAt(rendered, it) }

        assertThat(opener.clips.getValue(rendered.name).rendered).containsExactly(495L, 1485L, 2475L, 3498L, 4488L, 5478L).inOrder()
    }

    @Test
    fun `the served picture is the reader's own, recycling it leaves the next instant readable`() {
        val frames = SequentialSceneVideoFrames(Opener()::open, Fallback())

        val first = frames.frameAt(rendered, 500)!!
        first.recycle()
        val second = frames.frameAt(rendered, 1_500)!!

        assertThat(second.isRecycled).isFalse()
        assertThat(Color.green(second.getPixel(0, 0))).isEqualTo((1485 / 40))
    }

    @Test
    fun `a file the decoder cannot open is read by the fallback, the others are not`() {
        val opener = Opener(refuses = setOf(background.name))
        val fallback = Fallback()
        val frames = SequentialSceneVideoFrames(opener::open, fallback)

        instants.forEach { at ->
            frames.frameAt(background, at)
            frames.frameAt(rendered, at)
        }

        assertThat(fallback.asked.map { it.first }.toSet()).containsExactly(background.name)
        assertThat(fallback.asked).hasSize(6)
        assertThat(opener.opened.count { it == background.name }).isEqualTo(1)
    }

    @Test
    fun `the end of the reading releases every decoder and the fallback`() {
        val opener = Opener()
        val fallback = Fallback()
        val frames = SequentialSceneVideoFrames(opener::open, fallback)
        frames.frameAt(background, 500)
        frames.frameAt(rendered, 500)

        frames.close()

        assertThat(opener.clips.values.map { it.released }).containsExactly(true, true)
        assertThat(fallback.closed).isEqualTo(1)
    }

    @Test
    fun `the proof of a six-second clip on a video background reads each file in one pass and still accepts it`() = runTest {
        val opener = Opener()
        val job = SceneExportJob(
            plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 6_000)), emptyList(), still = false),
            format = StoryExportVideoFormat.of(),
            fills = listOf(SceneExportSlideFill.Video(background, listOf(StoryExportClipRange(0, 6_000)))),
            overlays = emptyList(),
            sounds = emptyMap(),
            output = rendered,
        )

        RenderedContentProof(AndroidSceneContentLuma(SequentialSceneVideoFrames(opener::open, Fallback()))).verify(job)

        assertThat(opener.opened).containsExactly(background.name, rendered.name)
        assertThat(opener.clips.values.sumOf { it.decoded }).isAtMost(2 * 181)
        assertThat(opener.clips.values.all { it.released }).isTrue()
    }

    private companion object {
        const val STEP = 33L
    }
}

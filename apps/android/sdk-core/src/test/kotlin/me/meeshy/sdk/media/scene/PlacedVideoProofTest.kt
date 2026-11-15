package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportPlacedVideoClock
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test

/**
 * #13897 — RenderedContentProof a laissé passer le MP4 du S8 dont la vidéo posée manquait à toutes les images : elle ne
 * confrontait que la luminance la plus haute de chaque instant, celle du dégradé, qui se voyait. Au cœur du cadre d'une
 * vidéo posée à l'écran, le rendu doit désormais ressembler à la vidéo plus qu'à ce qu'elle recouvre.
 */
class PlacedVideoProofTest {

    private val format = StoryExportVideoFormat.of()
    private val video = File("fg.mp4")
    private val output = File("meeshy-scene.mp4")
    private val green = SceneColor(26f, 127f, 75f, 1f)
    private val footage = SceneColor(200f, 180f, 160f, 1f)

    private val placement = SceneExportPlacement(centerX = 540f, centerY = 768f, width = 702f, height = 395f)

    private fun draft(
        overlays: List<SceneExportOverlay> = listOf(
            SceneExportOverlay.Stored(0, 6_000, File("calque-0.png")),
            SceneExportOverlay.Stored(6_000, 14_218, File("calque-1.png")),
        ),
        matrix: FloatArray? = null,
        pose: SceneExportPlacement = placement,
    ) = SceneExportJob(
        plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 6_000), StoryExportSlide(1, 6_000, 8_218)), emptyList(), still = false),
        format = format,
        fills = listOf(SceneExportSlideFill.Picture(File("fond-0.png")), SceneExportSlideFill.Picture(File("fond-1.png"))),
        overlays = overlays,
        sounds = emptyMap(),
        output = output,
        placedVideos = listOf(
            SceneExportPlacedVideo(video, StoryExportPlacedVideoClock(6_000, 14_218, StoryExportClipRange(0, 8_200)), depth = 0, colorMatrix = matrix) { pose },
        ),
    )

    /** Le dégradé vert partout sous les calques ; la vidéo posée de couleur [footage] ; le rendu qui montre [rendered]. */
    private class Measured(
        private val under: SceneColor,
        private val footage: SceneColor?,
        private val rendered: (Long) -> SceneColor?,
        private val regions: Map<String, SceneColor> = emptyMap(),
    ) : SceneContentLuma {
        val footageAt = mutableListOf<Long>()
        override fun image(file: File): Int? = 120
        override fun bitmap(bitmap: Bitmap): Int = 0
        override fun videoFrame(file: File, atMillis: Long): Int? = 120
        override fun imageRegion(file: File, region: SceneRegion): SceneColor? = regions[file.name] ?: under
        override fun videoRegion(file: File, atMillis: Long, region: SceneRegion): SceneColor? =
            if (file.name == "meeshy-scene.mp4") rendered(atMillis) else footage.also { footageAt += atMillis }
    }

    @Test
    fun `le rendu du S8, ou la video posee manque, echoue en la nommant`() = runTest {
        val failure = runCatching { RenderedContentProof(Measured(green, footage, rendered = { green })).verify(draft()) }.exceptionOrNull()
        assertThat(failure).isInstanceOf(IllegalStateException::class.java)
        assertThat(failure).hasMessageThat().contains("la vidéo posée fg.mp4 (6000–14218 ms) manque au rendu à 3 instant(s)")
        assertThat(failure).hasMessageThat().contains("à 8293 ms")
    }

    @Test
    fun `un rendu qui montre la video posee passe, relue a l instant de sa source`() = runTest {
        val measured = Measured(green, footage, rendered = { at -> if (at >= 6_000) SceneColor(196f, 176f, 158f, 1f) else green })
        RenderedContentProof(measured).verify(draft())
        assertThat(measured.footageAt).containsExactly(2_293L, 4_663L, 7_033L).inOrder()
    }

    @Test
    fun `une video qui ressemble a son dessous, cachee par un objet d au-dessus ou illisible n accuse rien`() = runTest {
        RenderedContentProof(Measured(green, SceneColor(30f, 130f, 80f, 1f), rendered = { green })).verify(draft())
        val covered = draft(
            overlays = listOf(
                SceneExportOverlay.Stored(0, 6_000, File("calque-0.png")),
                SceneExportOverlay.Stored(6_000, 14_218, File("calque-1.png")),
                SceneExportOverlay.Stored(6_000, 14_218, File("texte.png"), depth = 1),
            ),
        )
        RenderedContentProof(Measured(green, footage, rendered = { green }, regions = mapOf("texte.png" to SceneColor(255f, 255f, 255f, 1f)))).verify(covered)
        RenderedContentProof(Measured(green, null, rendered = { green })).verify(draft())
        RenderedContentProof(Measured(green, footage, rendered = { null })).verify(draft())
    }

    @Test
    fun `une video en fondu a demi transparente ne se juge pas, son look compte`() = runTest {
        RenderedContentProof(Measured(green, footage, rendered = { green })).verify(draft(pose = placement.copy(opacity = 0.3f)))
        val grey = floatArrayOf(0f, 0f, 0f, 0f, 26f, 0f, 0f, 0f, 0f, 127f, 0f, 0f, 0f, 0f, 75f, 0f, 0f, 0f, 1f, 0f)
        RenderedContentProof(Measured(green, footage, rendered = { green })).verify(draft(matrix = grey))
    }

    @Test
    fun `la region relue est le coeur du cadre, a l ecran comme dans la source`() {
        val out = PlacedVideoContent.outputRegion(placement, format)
        assertThat(out.left).isWithin(1e-4f).of((540f - 79f) / format.width)
        assertThat(out.bottom).isWithin(1e-4f).of((768f + 79f) / format.height)
        val source = PlacedVideoContent.sourceRegion(placement)
        assertThat(source.left).isWithin(1e-4f).of(0.5f - 79f / 702f)
        assertThat(source.top).isWithin(1e-4f).of(0.5f - 79f / 395f)
    }

    @Test
    fun `une couleur se compose prémultipliee et passe sous un look`() {
        val half = SceneColor(100f, 0f, 0f, 0.5f)
        assertThat(half.over(SceneColor.BLACK)).isEqualTo(SceneColor(100f, 0f, 0f, 1f))
        assertThat(SceneColor.mean(intArrayOf(0xFFFF0000.toInt(), 0x00000000))).isEqualTo(SceneColor(127.5f, 0f, 0f, 0.5f))
        val swap = floatArrayOf(0f, 0f, 1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)
        assertThat(SceneColor(255f, 0f, 10f, 1f).under(swap)).isEqualTo(SceneColor(10f, 0f, 255f, 1f))
    }
}

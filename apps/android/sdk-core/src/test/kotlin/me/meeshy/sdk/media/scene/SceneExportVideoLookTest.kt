package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Color
import androidx.media3.effect.Crop
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.Presentation
import androidx.media3.effect.RgbMatrix
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.model.composer.look.ComposerVideoFramePlacement
import me.meeshy.sdk.model.composer.look.ComposerVideoLook
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.scene.StoryColorMatrix
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportPlacedVideoClock
import me.meeshy.sdk.model.scene.export.StoryExportSlide
import me.meeshy.sdk.model.scene.export.StoryExportTimelinePlan
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * #14875 — l'export d'une story à vidéo réglée encodait chaque vidéo une fois de plus avant le rendu (la cuisson de la
 * publication, puis la composition). Le look d'une vidéo entre désormais dans la passe UNIQUE de l'export : les effets de la
 * retouche sur chaque item de la vidéo de fond, et le même look peint image par image sur une vidéo posée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SceneExportVideoLookTest {

    private val format = StoryExportVideoFormat.of()

    private fun solid(color: Int, width: Int, height: Int) = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(color) }

    private val swapRedToBlue = StoryColorMatrix(listOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0).map(Double::toFloat))

    private val warm = SceneExportVideoLook(NormalizedCrop(0.1f, 0.1f, 0.8f, 0.8f), RetouchVideoLook(rgbMatrix = ComposerVideoLook.rgbMatrix(swapRedToBlue)))

    private fun job(fills: List<SceneExportSlideFill>, placed: List<SceneExportPlacedVideo> = emptyList()) = SceneExportJob(
        plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 4_000), StoryExportSlide(1, 4_000, 6_000)), emptyList(), still = false),
        format = format,
        fills = fills,
        overlays = listOf(SceneExportOverlay.Stored(0, 10_000, File("calque.png"))),
        sounds = emptyMap(),
        output = File("out.mp4"),
        placedVideos = placed,
    )

    private val lookedBackground = listOf(
        SceneExportSlideFill.Picture(File("fond-0.png")),
        SceneExportSlideFill.Video(
            File("camera.mp4"),
            listOf(StoryExportClipRange(0, 2_000), StoryExportClipRange(0, 2_000)),
            SceneExportHold(File("fin-1.png"), 2_000),
            look = warm,
        ),
    )

    @Test
    fun `une video de fond reglee porte son look sur chacun de ses tours et sur son image tenue, avant le cadrage au format`() {
        val items = Media3SceneComposition.of(job(lookedBackground)).sequences.first().editedMediaItems
        assertThat(items).hasSize(4)

        val looked = items.drop(1).map { it.effects.videoEffects }
        looked.forEach { effects ->
            assertThat(effects[0]).isInstanceOf(Crop::class.java)
            assertThat(effects[1]).isInstanceOf(RgbMatrix::class.java)
            assertThat(effects[2]).isInstanceOf(Presentation::class.java)
        }
        assertThat(looked.distinct()).hasSize(1)
        assertThat(items.first().effects.videoEffects.none { it is Crop || it is RgbMatrix }).isTrue()
        assertThat(items.first().effects.videoEffects.last()).isSameInstanceAs(looked.first().last())
    }

    @Test
    fun `le cadre d une video de fond reglee se pose avec les objets, sur sa seule fenetre, sans passe de plus`() {
        val frame = solid(Color.GREEN, 160, 90).also { layer ->
            (10 until 150).forEach { x -> (10 until 80).forEach { y -> layer.setPixel(x, y, Color.TRANSPARENT) } }
        }
        val framed = SceneExportVideoLook(null, RetouchVideoLook(frame = frame, placement = ComposerVideoFramePlacement(0.8f, 0f, 0f)))
        val fills = lookedBackground.mapIndexed { index, fill -> if (index == 1) (fill as SceneExportSlideFill.Video).copy(look = framed) else fill }
        val job = job(fills)
        val items = Media3SceneComposition.of(job).sequences.first().editedMediaItems

        val shared = items.first().effects.videoEffects
        items.drop(1).forEach { item ->
            assertThat(item.effects.videoEffects.filterIsInstance<OverlayEffect>()).containsExactlyElementsIn(shared.filterIsInstance<OverlayEffect>())
            assertThat(item.effects.videoEffects.takeLast(shared.size)).containsExactlyElementsIn(shared).inOrder()
        }
        val layers = Media3SceneComposition.overlaysOf(job, SceneCompositionPlanner.of(job))
        val bottom = layers.first() as SceneLookFrameOverlay
        assertThat(bottom.getBitmap(2_000_000L)).isSameInstanceAs(SceneTransparent.pixel)
        val shown = bottom.getBitmap(5_000_000L)
        assertThat(shown.width).isEqualTo(format.width)
        assertThat(shown.height).isEqualTo(format.height)
        assertThat(shown.getPixel(format.width / 2, 20)).isEqualTo(Color.GREEN)
        assertThat(Color.alpha(shown.getPixel(format.width / 2, format.height / 2))).isEqualTo(0)
        assertThat(bottom.getBitmap(9_900_000L)).isSameInstanceAs(shown)
        assertThat(bottom.getBitmap(10_000_000L)).isSameInstanceAs(SceneTransparent.pixel)
    }

    @Test
    fun `une video de fond sans look garde la liste commune, sans aucun effet de retouche`() {
        val plain = lookedBackground.mapIndexed { index, fill -> if (index == 1) (fill as SceneExportSlideFill.Video).copy(look = null) else fill }
        val items = Media3SceneComposition.of(job(plain)).sequences.first().editedMediaItems
        assertThat(items.map { it.effects.videoEffects }.distinct()).hasSize(1)
    }

    @Test
    fun `la ligne de journal dit quelle plage part sous son look`() {
        val planned = SceneCompositionPlanner.of(job(lookedBackground))
        assertThat(planned.describe(overlays = 1)).contains("plage 0–2000 ms de camera.mp4 sous son look")
        assertThat(planned.describe(overlays = 1)).contains("image 2000 ms (fin-1.png) sous son look")
    }

    @Test
    fun `la couleur du filtre se relit en matrice d Android pour une video peinte image par image`() {
        val values = listOf(1.2, 0.1, 0.0, 0.0, 12.0, 0.0, 0.9, 0.1, 0.0, -5.0, 0.0, 0.0, 1.1, 0.0, 3.0, 0.0, 0.0, 0.0, 1.0, 0.0)
        val look = SceneExportVideoLook(null, RetouchVideoLook(rgbMatrix = ComposerVideoLook.rgbMatrix(StoryColorMatrix(values.map(Double::toFloat)))))
        look.colorMatrix!!.toList().zip(values).forEach { (read, written) -> assertThat(read.toDouble()).isWithin(1e-4).of(written) }
        assertThat(SceneExportVideoLook(null, RetouchVideoLook.NONE).colorMatrix).isNull()
    }

    private val placement = SceneExportPlacement(centerX = 540f, centerY = 768f, width = 702f, height = 395f)

    private fun placed(look: SceneExportVideoLook?) =
        SceneExportPlacedVideo(File("fg.mp4"), StoryExportPlacedVideoClock(4_000, 10_000, StoryExportClipRange(0, 6_000)), depth = 0, look = look) { placement }

    private class Frames(private val frame: Bitmap) : PlacedVideoFrames {
        override fun frameAt(sourceMillis: Long): Bitmap = frame
        override fun release() = Unit
    }

    /** Moitié gauche rouge, moitié droite bleue : le cadrage se voit à ce qui reste. */
    private fun halves(): Bitmap = solid(Color.BLUE, 160, 90).also { bitmap ->
        (0 until 80).forEach { x -> (0 until 90).forEach { y -> bitmap.setPixel(x, y, Color.RED) } }
    }

    @Test
    fun `une video posee reglee montre son cadrage et son filtre dans son cadre`() {
        val cropped = PlacedVideoOverlay(placed(SceneExportVideoLook(NormalizedCrop(0f, 0f, 0.5f, 1f), RetouchVideoLook.NONE)), format) { Frames(halves()) }
        assertThat(cropped.getBitmap(5_000_000L).getPixel(540 + 300, 768)).isEqualTo(Color.RED)

        val filtered = PlacedVideoOverlay(placed(SceneExportVideoLook(null, RetouchVideoLook(rgbMatrix = ComposerVideoLook.rgbMatrix(swapRedToBlue)))), format) {
            Frames(solid(Color.RED, 160, 90))
        }
        val inside = filtered.getBitmap(5_000_000L).getPixel(540, 768)
        assertThat(Color.blue(inside)).isGreaterThan(200)
        assertThat(Color.red(inside)).isLessThan(20)
    }

    @Test
    fun `une video posee encadree porte son cadre par-dessus elle, posee dans sa case`() {
        val frame = solid(Color.GREEN, 160, 90).also { layer ->
            (10 until 150).forEach { x -> (10 until 80).forEach { y -> layer.setPixel(x, y, Color.TRANSPARENT) } }
        }
        val look = SceneExportVideoLook(null, RetouchVideoLook(frame = frame, placement = ComposerVideoFramePlacement(0.5f, 0f, 0f)))
        val shown = PlacedVideoOverlay(placed(look), format) { Frames(solid(Color.RED, 160, 90)) }.getBitmap(5_000_000L)

        assertThat(shown.getPixel(540, 768 - 197 + 20)).isEqualTo(Color.GREEN)
        assertThat(shown.getPixel(540, 768)).isEqualTo(Color.RED)
        assertThat(Color.alpha(shown.getPixel(540, 768 - 128))).isEqualTo(0)
    }

    private class Measured(private val rendered: SceneColor) : SceneContentLuma {
        val footageRegions = mutableListOf<SceneRegion>()
        override fun image(file: File): Int? = 120
        override fun bitmap(bitmap: Bitmap): Int = 0
        override fun videoFrame(file: File, atMillis: Long): Int? = 120
        override fun imageRegion(file: File, region: SceneRegion): SceneColor = SceneColor(26f, 127f, 75f, 1f)
        override fun videoRegion(file: File, atMillis: Long, region: SceneRegion): SceneColor? =
            if (file.name == "out.mp4") rendered else SceneColor(255f, 0f, 0f, 1f).also { footageRegions += region }
    }

    private val pictures = listOf(SceneExportSlideFill.Picture(File("fond-0.png")), SceneExportSlideFill.Picture(File("fond-1.png")))

    @Test
    fun `la preuve attend la video posee sous son filtre, relue dans son cadrage`() = runTest {
        val look = SceneExportVideoLook(NormalizedCrop(0f, 0f, 0.5f, 1f), RetouchVideoLook(rgbMatrix = ComposerVideoLook.rgbMatrix(swapRedToBlue)))
        val measured = Measured(rendered = SceneColor(0f, 0f, 250f, 1f))
        RenderedContentProof(measured).verify(job(pictures, listOf(placed(look))))

        assertThat(measured.footageRegions).isNotEmpty()
        measured.footageRegions.forEach { assertThat(it.right).isAtMost(0.5f) }
        val red = runCatching { RenderedContentProof(Measured(rendered = SceneColor(26f, 127f, 75f, 1f))).verify(job(pictures, listOf(placed(look)))) }
        assertThat(red.exceptionOrNull()).hasMessageThat().contains("manque au rendu")
    }

    @Test
    fun `une video posee encadree ne se juge pas a son coeur, que le cadre peut couvrir`() = runTest {
        val look = SceneExportVideoLook(null, RetouchVideoLook(frame = solid(Color.GREEN, 16, 9)))
        RenderedContentProof(Measured(rendered = SceneColor(26f, 127f, 75f, 1f))).verify(job(pictures, listOf(placed(look))))
    }
}

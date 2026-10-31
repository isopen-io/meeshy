package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Color
import androidx.media3.effect.OverlayEffect
import com.google.common.truth.Truth.assertThat
import java.io.File
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
 * #13897 — sur le S8, une vidéo POSÉE sur une diapo à fond dégradé ne sortait dans aucune image du MP4 : la composition ne
 * la déclarait pas (« vidéo [image 6000 ms (fond-0.png), image 8218 ms (fond-1.png)] … 2 calque(s) d'objets »). Elle est
 * désormais un calque vivant de la liste d'effets que chaque item porte, à sa place dans la pile, et peint à chaque image
 * l'image de sa source que son horloge désigne, dans son cadre et sous son look.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PlacedVideoOverlayTest {

    private val format = StoryExportVideoFormat.of()
    private val video = File("fg.mp4")

    private fun solid(color: Int, width: Int = 4, height: Int = 4) = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).apply { eraseColor(color) }

    private val gradient = SceneExportOverlay.Painted(0, 6_000, solid(0xFF1A7F4B.toInt()))
    private val secondBelow = SceneExportOverlay.Painted(6_000, 14_218, solid(0xFF1A7F4B.toInt()))
    private val caption = SceneExportOverlay.Painted(6_000, 14_218, solid(0x00000000), depth = 1)

    private val placement = SceneExportPlacement(centerX = 540f, centerY = 768f, width = 702f, height = 395f, cornerRadius = 24f)

    /** La vidéo du S8 : 8,2 s, posée sur toute la seconde diapo, de 6 000 à 14 218 ms, une fenêtre coupée à 2–4 s. */
    private fun placed(
        window: StoryExportClipRange = StoryExportClipRange(2_000, 4_000),
        pose: SceneExportPlacement = placement,
        matrix: FloatArray? = null,
    ) = SceneExportPlacedVideo(video, StoryExportPlacedVideoClock(6_000, 14_218, window), depth = 0, colorMatrix = matrix) { pose }

    private class Frames(private val frame: Bitmap?) : PlacedVideoFrames {
        val asked = mutableListOf<Long>()
        var released = 0
        override fun frameAt(sourceMillis: Long): Bitmap? = frame.also { asked += sourceMillis }
        override fun release() { released++ }
    }

    private fun draft(placedVideos: List<SceneExportPlacedVideo>, overlays: List<SceneExportOverlay> = listOf(gradient, secondBelow, caption)) = SceneExportJob(
        plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 6_000), StoryExportSlide(1, 6_000, 8_218)), emptyList(), still = false),
        format = format,
        fills = listOf(SceneExportSlideFill.Picture(File("fond-0.png")), SceneExportSlideFill.Picture(File("fond-1.png"))),
        overlays = overlays,
        sounds = emptyMap(),
        output = File("out.mp4"),
        placedVideos = placedVideos,
    )

    @Test
    fun `la video posee est un calque de la liste, entre les objets d en dessous et ceux d au-dessus`() {
        val job = draft(listOf(placed()))
        val layers = Media3SceneComposition.overlaysOf(job, SceneCompositionPlanner.of(job)) { Frames(null) }
        assertThat(layers.map { it::class }).containsExactly(TimedBitmapOverlay::class, PlacedVideoOverlay::class, TimedBitmapOverlay::class).inOrder()

        val items = Media3SceneComposition.of(job) { Frames(null) }.sequences.first().editedMediaItems
        assertThat(items).hasSize(2)
        assertThat(items.map { item -> item.effects.videoEffects.filterIsInstance<OverlayEffect>().single() }.distinct()).hasSize(1)
    }

    @Test
    fun `a chaque image la video montre l image de sa fenetre, en boucle, dans son cadre`() {
        val frames = Frames(solid(Color.RED, 16, 9))
        val overlay = PlacedVideoOverlay(placed(), format) { frames }

        val shown = overlay.getBitmap(7_500_000L)
        assertThat(shown.width).isEqualTo(format.width)
        assertThat(shown.height).isEqualTo(format.height)
        assertThat(shown.getPixel(540, 768)).isEqualTo(Color.RED)
        assertThat(shown.getPixel(540, 768 + 180)).isEqualTo(Color.RED)
        assertThat(Color.alpha(shown.getPixel(540, 768 + 230))).isEqualTo(0)
        assertThat(Color.alpha(shown.getPixel(100, 100))).isEqualTo(0)
        overlay.getBitmap(8_500_000L)
        assertThat(frames.asked).containsExactly(3_500L, 2_500L).inOrder()
    }

    @Test
    fun `hors de sa diapo la video ne pose rien, et rend son decodeur une fois passee`() {
        val frames = Frames(solid(Color.RED, 16, 9))
        val overlay = PlacedVideoOverlay(placed(), format) { frames }

        assertThat(overlay.getBitmap(3_000_000L)).isSameInstanceAs(SceneTransparent.pixel)
        assertThat(frames.asked).isEmpty()
        overlay.getBitmap(9_000_000L)
        assertThat(overlay.getBitmap(14_218_000L)).isSameInstanceAs(SceneTransparent.pixel)
        assertThat(frames.released).isEqualTo(1)
    }

    @Test
    fun `la video tourne avec son cadre, a son opacite et sous son look`() {
        val swapRedToBlue = floatArrayOf(0f, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)
        val turned = placement.copy(rotationDegrees = 90f, opacity = 0.5f)
        val overlay = PlacedVideoOverlay(placed(pose = turned, matrix = swapRedToBlue), format) { Frames(solid(Color.RED, 16, 9)) }

        val shown = overlay.getBitmap(7_000_000L)
        val inside = shown.getPixel(540, 768 + 300)
        assertThat(Color.alpha(inside)).isIn(120..135)
        assertThat(Color.blue(inside)).isGreaterThan(200)
        assertThat(Color.red(inside)).isLessThan(20)
        assertThat(Color.alpha(shown.getPixel(540 + 300, 768))).isEqualTo(0)
    }

    @Test
    fun `une image qui ne se decode pas ne pose rien`() {
        val overlay = PlacedVideoOverlay(placed(), format) { Frames(null) }
        assertThat(overlay.getBitmap(7_000_000L)).isSameInstanceAs(SceneTransparent.pixel)
    }

    @Test
    fun `les objets d au-dessus de la video ne se posent que sur sa diapo`() {
        val above = TimedBitmapOverlay(listOf(caption), gaps = true)
        assertThat(above.getBitmap(3_000_000L)).isSameInstanceAs(SceneTransparent.pixel)
        assertThat(above.getBitmap(9_000_000L)).isSameInstanceAs(caption.bitmap)
        val below = TimedBitmapOverlay(listOf(gradient, secondBelow))
        assertThat(below.getBitmap(20_000_000L)).isSameInstanceAs(secondBelow.bitmap)
    }

    @Test
    fun `la ligne de journal dit la video posee qui part au moteur`() {
        val job = draft(listOf(placed()))
        assertThat(SceneCompositionPlanner.of(job).describe(job.overlays.size, job.placedVideos)).isEqualTo(
            "composition de 14218 ms : vidéo [image 6000 ms (fond-0.png), image 8218 ms (fond-1.png)], 0 séquence(s) son, 3 calque(s) d'objets, " +
                "vidéo(s) posée(s) [6000–14218 ms de fg.mp4 (plage 2000–4000 ms, profondeur 0)], 0 carte(s) de marque",
        )
    }
}

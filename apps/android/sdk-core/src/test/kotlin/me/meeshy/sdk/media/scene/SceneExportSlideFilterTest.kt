package me.meeshy.sdk.media.scene

import android.graphics.Bitmap
import android.graphics.Color
import androidx.media3.effect.Presentation
import androidx.media3.effect.RgbMatrix
import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.composer.look.ComposerVideoFramePlacement
import me.meeshy.sdk.model.composer.look.ComposerVideoLook
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookRecipe
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
 * #15224 — le filtre de diapo que l'aperçu peint sur tout le fond (la vidéo ET son cadre) n'entrait pas dans la vidéo
 * enregistrée : elle sortait en couleur sous un aperçu noir et blanc. Il entre désormais dans la passe unique de l'export,
 * par-dessus le look propre de la vidéo de fond et sur son cadre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SceneExportSlideFilterTest {

    private val format = StoryExportVideoFormat.of()

    private val grey: StoryColorMatrix = SceneLookMatrix.composed(SceneLookRecipe.forStory(StoryFilter.BW, 1f, adjustments = null, isVideo = true))

    private fun gpuOf(effect: RgbMatrix): List<Float> = effect.getMatrix(0L, false).toList()

    private fun job(look: SceneExportVideoLook, placed: List<SceneExportPlacedVideo> = emptyList()) = SceneExportJob(
        plan = StoryExportTimelinePlan(listOf(StoryExportSlide(0, 0, 4_000)), emptyList(), still = false),
        format = format,
        fills = listOf(SceneExportSlideFill.Video(File("fond.mp4"), listOf(StoryExportClipRange(0, 3_000)), SceneExportHold(File("fin-0.png"), 1_000), look)),
        overlays = emptyList(),
        sounds = emptyMap(),
        output = File("out.mp4"),
        placedVideos = placed,
    )

    @Test
    fun `une video de fond nue sous un filtre de diapo recoit sa matrice avant le cadrage au format, sur chaque tour et sur son image tenue`() {
        val items = Media3SceneComposition.of(job(SceneExportVideoLook.ofScene(grey))).sequences.first().editedMediaItems

        assertThat(items).hasSize(2)
        items.forEach { item ->
            val effects = item.effects.videoEffects
            val filter = effects.filterIsInstance<RgbMatrix>().single()
            assertThat(gpuOf(filter)).isEqualTo(ComposerVideoLook.rgbMatrix(grey).toList())
            assertThat(effects.indexOf(filter)).isLessThan(effects.indexOfFirst { it is Presentation })
        }
    }

    @Test
    fun `le filtre de diapo se pose apres le look propre de la video, jamais a sa place`() {
        val own = ComposerVideoLook.rgbMatrix(StoryColorMatrix(List(20) { if (it % 6 == 0) 0.5f else 0f }))
        val looked = SceneExportVideoLook(null, RetouchVideoLook(rgbMatrix = own)).underScene(grey)

        val matrices = Media3SceneComposition.of(job(looked)).sequences.first().editedMediaItems.first()
            .effects.videoEffects.filterIsInstance<RgbMatrix>().map(::gpuOf)

        assertThat(matrices).containsExactly(own.toList(), ComposerVideoLook.rgbMatrix(grey).toList()).inOrder()
    }

    @Test
    fun `le cadre de la video de fond passe sous le meme filtre de diapo que la video`() {
        val frame = Bitmap.createBitmap(160, 90, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.rgb(255, 160, 0)) }
        val framed = SceneExportVideoLook(null, RetouchVideoLook(frame = frame, placement = ComposerVideoFramePlacement(0.8f, 0f, 0f))).underScene(grey)
        val planned = job(framed)

        val bottom = Media3SceneComposition.overlaysOf(planned, SceneCompositionPlanner.of(planned)).first() as SceneLookFrameOverlay
        val pixel = bottom.getBitmap(1_000_000L).getPixel(format.width / 2, format.height / 2)

        assertThat(Color.red(pixel)).isWithin(2).of(Color.green(pixel))
        assertThat(Color.green(pixel)).isWithin(2).of(Color.blue(pixel))
        assertThat(Color.red(pixel)).isGreaterThan(40)
    }

    @Test
    fun `sans filtre de diapo, la video reglee garde son seul look`() {
        val own = ComposerVideoLook.rgbMatrix(StoryColorMatrix(List(20) { if (it % 6 == 0) 0.5f else 0f }))
        val looked = SceneExportVideoLook(null, RetouchVideoLook(rgbMatrix = own))

        val matrices = Media3SceneComposition.of(job(looked)).sequences.first().editedMediaItems.first()
            .effects.videoEffects.filterIsInstance<RgbMatrix>()

        assertThat(matrices).hasSize(1)
    }

    private class Measured(private val rendered: SceneColor) : SceneContentLuma {
        override fun image(file: File): Int? = 120
        override fun bitmap(bitmap: Bitmap): Int = 0
        override fun videoFrame(file: File, atMillis: Long): Int? = 120
        override fun videoRegion(file: File, atMillis: Long, region: SceneRegion): SceneColor = when (file.name) {
            "out.mp4" -> rendered
            "fond.mp4" -> SceneColor(255f, 0f, 0f, 1f)
            else -> SceneColor(0f, 0f, 250f, 1f)
        }
    }

    private fun withPlacedVideo(look: SceneExportVideoLook): SceneExportJob {
        val placement = SceneExportPlacement(centerX = 540f, centerY = 768f, width = 702f, height = 395f)
        return job(look, listOf(SceneExportPlacedVideo(File("fg.mp4"), StoryExportPlacedVideoClock(0, 4_000, StoryExportClipRange(0, 4_000)), depth = 0) { placement }))
    }

    @Test
    fun `la preuve attend le fond d une video posee sous le filtre de diapo, et voit qu elle manque`() = runTest {
        val greyedRed = SceneColor(255f, 0f, 0f, 1f).under(SceneExportVideoLook.ofScene(grey).sceneColorMatrix)

        val missing = runCatching { RenderedContentProof(Measured(rendered = greyedRed)).verify(withPlacedVideo(SceneExportVideoLook.ofScene(grey))) }
        assertThat(missing.exceptionOrNull()).hasMessageThat().contains("manque au rendu")

        RenderedContentProof(Measured(rendered = SceneColor(0f, 0f, 250f, 1f))).verify(withPlacedVideo(SceneExportVideoLook.ofScene(grey)))
    }
}

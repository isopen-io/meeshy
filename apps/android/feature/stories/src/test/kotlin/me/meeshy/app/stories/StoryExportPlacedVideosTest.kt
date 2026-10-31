package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.scene.ForegroundMediaFrame
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #13897 — recette S8 du 2026-10-31 : un post de deux diapos, la seconde à fond dégradé avec une vidéo de la galerie POSÉE
 * comme objet. Le MP4 portait le son de la vidéo et aucune de ses images : la composition ne la déclarait pas, et le peintre
 * des calques n'en tient que l'affiche (rien pour un brouillon sans vignette). L'export la déclare désormais au moteur, à sa
 * place dans la pile, et peint les objets en étages autour d'elle.
 */
class StoryExportPlacedVideosTest {

    @get:Rule val folder = TemporaryFolder()

    private val base = "https://gate.meeshy.me"
    private val format = StoryExportVideoFormat.of()

    private fun video(x: Double = 0.5, y: Double = 0.4, z: Int = 1, window: StorySourceWindowMs? = null, look: SceneLookRecipe = SceneLookRecipe.NEUTRAL) =
        StoryForegroundMediaView(
            id = "fg", url = "$base/api/v1/attachments/file/fg.mp4", isVideo = true,
            x = x, y = y, scale = 1.0, aspectRatio = 16.0 / 9.0, rotation = 12.0, sourceWindow = window, lookRecipe = look, zIndex = z,
        )

    private fun caption(z: Int) = StoryTextObjectView(
        id = "t", text = "Au-dessus", x = 0.5, y = 0.8, scale = 1.0, rotation = 0.0, fontSize = 40.0, colorHex = "#FFFFFF", align = "center", zIndex = z,
    )

    private val gradientSlide = StorySlideView(id = "s1", text = "", isTranslated = false, imageUrl = null, accentHex = "1A7F4B")

    private fun videoSlide(textZ: Int = 2, placed: StoryForegroundMediaView = video()) =
        StorySlideView(id = "s2", text = "", isTranslated = false, imageUrl = null, accentHex = "1A7F4B", foregroundMedia = listOf(placed), textObjects = listOf(caption(textZ)))

    private val gradientItem = StoryItem(
        id = "s1",
        storyEffects = StoryEffects(textObjects = listOf(StoryTextObject(id = "a", text = "Bonjour", startTime = 0.0, duration = 6.0))),
    )

    private fun videoItem(window: Pair<Double, Double>? = null) = StoryItem(
        id = "s2",
        media = listOf(FeedMedia(id = "m-fg", type = FeedMediaType.VIDEO, url = "/api/v1/attachments/file/fg.mp4")),
        storyEffects = StoryEffects(
            mediaObjects = listOf(
                StoryMediaObject(id = "fg", postMediaId = "m-fg", mediaType = "video", isBackground = false, sourceStart = window?.first, sourceEnd = window?.second),
            ),
        ),
    )

    private class Recorder {
        val paints = mutableListOf<StoryExportPaintRequest>()
        val fetched = mutableListOf<String>()
    }

    private fun preparer(recorder: Recorder, failing: Set<String> = emptySet()) = StoryVideoExportPreparer(
        fetch = { url, target ->
            recorder.fetched += url
            if (failing.any { url.endsWith(it) }) throw java.io.IOException("refus")
            target.writeText(url.substringAfterLast('/'))
        },
        probeMillis = { file -> mapOf("fg.mp4" to 8_200L)[file.readText()] },
        blankPicture = { it.writeText("noir") },
        chooseLength = { null },
        paint = { request ->
            recorder.paints += request
            request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } }
        },
        format = format,
        warn = { _, _ -> },
    )

    private fun scenes(slide: StorySlideView = videoSlide(), item: StoryItem = videoItem()) = listOf(
        StoryExportScene(StoryExportSubject.of(gradientItem, gradientSlide, base), gradientSlide),
        StoryExportScene(StoryExportSubject.of(item, slide, base), slide),
    )

    @Test fun `la video posee du brouillon du S8 part au moteur, vivante sur toute sa diapo`() = runTest {
        val job = preparer(Recorder()).prepare(StoryExportMode.SAVE, scenes(), folder.newFile("post.mp4"), folder.newFolder("w"))

        val second = job.plan.slides[1]
        val placed = job.placedVideos.single()
        assertThat(placed.file.readText()).isEqualTo("fg.mp4")
        assertThat(placed.depth).isEqualTo(0)
        assertThat(placed.clock.startMillis).isEqualTo(second.startMillis)
        assertThat(placed.clock.endMillis).isEqualTo(second.endMillis)
        assertThat(placed.clock.window).isEqualTo(StoryExportClipRange(0, 8_200))
        assertThat(placed.clock.sourceAt(second.startMillis + 3_000)).isEqualTo(3_000)
        assertThat(placed.colorMatrix).isNull()
        assertThat(job.placedVideos.none { it.clock.startMillis < second.startMillis }).isTrue()
    }

    @Test fun `la video posee se pose ou le lecteur la peint, a chaque instant de sa diapo`() = runTest {
        val job = preparer(Recorder()).prepare(StoryExportMode.SAVE, scenes(), folder.newFile("post.mp4"), folder.newFolder("w"))
        val second = job.plan.slides[1]
        val placement = job.placedVideos.single().placementAt(second.startMillis + 1_000)!!

        val size = ForegroundMediaFrame.renderedSize(16.0 / 9.0, 1.0, format.width.toDouble())
        assertThat(placement.centerX).isEqualTo(format.width * 0.5f)
        assertThat(placement.centerY).isEqualTo(format.height * 0.4f)
        assertThat(placement.width).isEqualTo(size.width.toFloat())
        assertThat(placement.height).isEqualTo(size.height.toFloat())
        assertThat(placement.rotationDegrees).isEqualTo(12f)
        assertThat(placement.opacity).isEqualTo(1f)
        assertThat(placement.cornerRadius).isEqualTo(size.height.toFloat() * FOREGROUND_CORNER_FRACTION)
    }

    @Test fun `les objets se peignent en etages autour de la video, le fond dessous et le texte au-dessus`() = runTest {
        val recorder = Recorder()
        val job = preparer(recorder).prepare(StoryExportMode.SAVE, scenes(), folder.newFile("post.mp4"), folder.newFolder("w"))

        val ofVideoSlide = recorder.paints.filter { it.slide.id == "s2" }
        assertThat(ofVideoSlide).hasSize(2)
        val (below, above) = ofVideoSlide
        assertThat(below.withBackground).isTrue()
        assertThat(below.slide.foregroundMedia).isEmpty()
        assertThat(below.slide.textObjects).isEmpty()
        assertThat(above.withBackground).isFalse()
        assertThat(above.slide.textObjects.map { it.id }).containsExactly("t")
        assertThat(above.slide.foregroundMedia).isEmpty()
        assertThat(above.directory).isNotEqualTo(below.directory)
        val second = job.plan.slides[1]
        assertThat(job.overlays.filter { it.startMillis >= second.startMillis }.map { it.depth }.distinct()).containsExactly(0, 1)
        assertThat(job.overlays.filter { it.startMillis < second.startMillis }.map { it.depth }.distinct()).containsExactly(0)
    }

    @Test fun `un texte sous la video reste sous elle, et un etage vide au-dessus ne se peint pas`() = runTest {
        val recorder = Recorder()
        val job = preparer(recorder).prepare(StoryExportMode.SAVE, scenes(videoSlide(textZ = 0)), folder.newFile("post.mp4"), folder.newFolder("w"))

        val ofVideoSlide = recorder.paints.filter { it.slide.id == "s2" }
        assertThat(ofVideoSlide).hasSize(1)
        assertThat(ofVideoSlide.single().slide.textObjects.map { it.id }).containsExactly("t")
        assertThat(job.overlays.map { it.depth }.distinct()).containsExactly(0)
    }

    @Test fun `la fenetre coupee et le look de la video posee voyagent avec elle`() = runTest {
        val warm = SceneLookRecipe.forStory(me.meeshy.sdk.model.StoryFilter.WARM, 1f, null, isVideo = true)
        val slide = videoSlide(placed = video(window = StorySourceWindowMs(2_000, 4_000), look = warm))
        val job = preparer(Recorder()).prepare(StoryExportMode.SAVE, scenes(slide, videoItem(2.0 to 4.0)), folder.newFile("post.mp4"), folder.newFolder("w"))

        val placed = job.placedVideos.single()
        assertThat(placed.clock.window).isEqualTo(StoryExportClipRange(2_000, 4_000))
        assertThat(placed.clock.sourceAt(placed.clock.startMillis + 2_500)).isEqualTo(2_500)
        assertThat(placed.colorMatrix).isNotNull()
        assertThat(placed.colorMatrix!!.size).isEqualTo(20)
    }

    @Test(expected = java.io.IOException::class)
    fun `une video posee qui ne se rapatrie pas fait echouer l export plutot que de rendre une autre scene`() = runTest {
        preparer(Recorder(), failing = setOf("fg.mp4")).prepare(StoryExportMode.SAVE, scenes(), folder.newFile("post.mp4"), folder.newFolder("w"))
    }

    @Test fun `une diapo sans video posee se peint d un seul etage, comme avant`() {
        val bands = StoryExportPlacedVideos.bands(gradientSlide.copy(textObjects = listOf(caption(3))), withBackground = true)
        assertThat(bands).hasSize(1)
        assertThat(bands.single().depth).isEqualTo(0)
        assertThat(bands.single().withBackground).isTrue()
        assertThat(bands.single().slide.textObjects.map { it.id }).containsExactly("t")
    }
}

package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.media.scene.SceneExportPlacedVideo
import me.meeshy.sdk.media.scene.SceneExportSlideFill
import me.meeshy.sdk.media.scene.SceneExportVideoLook
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import org.junit.Assert.assertThrows
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #14848 — Enregistrer et Partager rendent une vidéo réglée du compositeur avec son look (filtre, cadre, cadrage), comme la
 * scène la montrait. #14875 — sans l'encoder une fois de plus avant le rendu : chaque vidéo, de fond ou posée, entre dans
 * le rendu TELLE QU'ELLE EST, et son look voyage avec elle jusqu'à la passe unique de l'export.
 */
class StoryExportVideoLookTest {

    @get:Rule val folder = TemporaryFolder()

    private val base = "https://gate.meeshy.me"
    private val bgUrl = "$base/api/v1/attachments/file/bg.mp4"
    private val fgUrl = "$base/api/v1/attachments/file/fg.mp4"
    private val warm = StoryMediaLook(filterPreset = "warm")
    private val polaroid = StoryMediaLook(frameId = "classic:polaroid")
    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "3 Nov 2026", "10:42"), "3 Nov 2026")

    private val item = StoryItem(
        id = "s",
        media = listOf(
            FeedMedia(id = "m-bg", type = FeedMediaType.VIDEO, url = "/api/v1/attachments/file/bg.mp4"),
            FeedMedia(id = "m-fg", type = FeedMediaType.VIDEO, url = "/api/v1/attachments/file/fg.mp4"),
        ),
        storyEffects = StoryEffects(
            mediaObjects = listOf(
                StoryMediaObject(id = "bg", postMediaId = "m-bg", mediaType = "video", isBackground = true),
                StoryMediaObject(id = "fg", postMediaId = "m-fg", mediaType = "video", isBackground = false),
            ),
        ),
    )

    private fun slide(looks: Map<String, StoryMediaLook>) = StorySlideView(
        id = "s",
        text = "",
        isTranslated = false,
        imageUrl = null,
        accentHex = "112233",
        backgroundVideoUrl = bgUrl,
        foregroundMedia = listOf(StoryForegroundMediaView(id = "fg", url = fgUrl, isVideo = true, x = 0.5, y = 0.5, scale = 1.0, aspectRatio = 9.0 / 16.0)),
        composerLooks = StorySceneMediaLooks.of(looks, author),
    )

    private class Resolved(val source: String, val look: StoryMediaLook, val author: ComposerLookAuthor, val maxLongSide: Int?)

    private fun preparer(resolved: MutableList<Resolved>, paints: Boolean = true) = StoryVideoExportPreparer(
        fetch = { url, target -> target.writeText(url.substringAfterLast('/')) },
        probeMillis = { file -> 6_000L.takeIf { file.readText().endsWith(".mp4") } },
        blankPicture = { it.writeText("noir") },
        paint = { request -> request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } } },
        exportLook = { source, look, signer, maxLongSide ->
            resolved += Resolved(source.readText(), look, signer, maxLongSide)
            SceneExportVideoLook(null, RetouchVideoLook(rgbMatrix = FloatArray(16))).takeIf { paints }
        },
        warn = { _, _ -> },
    )

    private fun scene(looks: Map<String, StoryMediaLook>) = slide(looks).let { listOf(StoryExportScene(StoryExportSubject.of(item, it, base), it)) }

    @Test fun `the background and the posed video enter the render as they are, each carrying its own look`() = runTest {
        val resolved = mutableListOf<Resolved>()
        val work = folder.newFolder("w")
        val job = preparer(resolved).prepare(StoryExportMode.SAVE, scene(mapOf(bgUrl to warm, fgUrl to polaroid)), folder.newFile("o.mp4"), work)

        val fill = job.fills.single() as SceneExportSlideFill.Video
        assertThat(fill.file.readText()).isEqualTo("bg.mp4")
        assertThat(fill.look).isNotNull()
        assertThat(job.placedVideos.single().file.readText()).isEqualTo("fg.mp4")
        assertThat(job.placedVideos.single().look).isNotNull()
        assertThat(resolved.map { Triple(it.source, it.look, it.maxLongSide) })
            .containsExactly(Triple("bg.mp4", warm, null), Triple("fg.mp4", polaroid, SceneExportPlacedVideo.DECODED_LONG_SIDE))
        assertThat(resolved.map { it.author }.distinct()).containsExactly(author)
        assertThat(work.walk().filter { it.extension == "mp4" }.toList()).isEmpty()
    }

    @Test fun `a video without a look enters the render as it is, with no look`() = runTest {
        val resolved = mutableListOf<Resolved>()
        val job = preparer(resolved).prepare(StoryExportMode.SAVE, scene(mapOf(fgUrl to warm)), folder.newFile("o.mp4"), folder.newFolder("w"))

        assertThat((job.fills.single() as SceneExportSlideFill.Video).look).isNull()
        assertThat(job.placedVideos.single().look).isNotNull()
        assertThat(resolved.map { it.source }).containsExactly("fg.mp4")
    }

    @Test fun `a face effect alone puts no look on a video`() = runTest {
        val resolved = mutableListOf<Resolved>()
        val toad = StoryMediaLook(faceEffect = "toad")
        val job = preparer(resolved).prepare(StoryExportMode.SAVE, scene(mapOf(bgUrl to toad)), folder.newFile("o.mp4"), folder.newFolder("w"))

        assertThat((job.fills.single() as SceneExportSlideFill.Video).look).isNull()
        assertThat(resolved).isEmpty()
    }

    @Test fun `a set video whose look cannot apply stops the export instead of rendering the original`() = runTest {
        val failure = assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                preparer(mutableListOf(), paints = false).prepare(StoryExportMode.SAVE, scene(mapOf(bgUrl to warm)), folder.newFile("o.mp4"), folder.newFolder("w"))
            }
        }
        assertThat(failure).hasMessageThat().contains("look")
    }
}

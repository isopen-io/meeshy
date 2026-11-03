package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.scene.SceneExportSlideFill
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
 * scène la montrait : chaque vidéo, de fond ou posée, passe par la cuisson de la publication avant d'entrer dans le rendu.
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

    private class Baked(val source: String, val look: StoryMediaLook, val author: ComposerLookAuthor)

    private fun preparer(baked: MutableList<Baked>, bakes: Boolean = true) = StoryVideoExportPreparer(
        fetch = { url, target -> target.writeText(url.substringAfterLast('/')) },
        probeMillis = { file -> 6_000L.takeIf { file.readText().endsWith(".mp4") } },
        blankPicture = { it.writeText("noir") },
        decideImager = { null },
        paint = { request -> request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } } },
        bakeLook = { source, look, signer, output ->
            baked += Baked(source.readText(), look, signer)
            if (bakes) output.writeText("cuit:${source.readText()}")
            bakes
        },
        warn = { _, _ -> },
    )

    private fun scene(looks: Map<String, StoryMediaLook>) = slide(looks).let { listOf(StoryExportScene(StoryExportSubject.of(item, it, base), it)) }

    @Test fun `the background and the posed video enter the render baked with their own look`() = runTest {
        val baked = mutableListOf<Baked>()
        val job = preparer(baked).prepare(StoryExportMode.SAVE, scene(mapOf(bgUrl to warm, fgUrl to polaroid)), folder.newFile("o.mp4"), folder.newFolder("w"))

        assertThat((job.fills.single() as SceneExportSlideFill.Video).file.readText()).isEqualTo("cuit:bg.mp4")
        assertThat(job.placedVideos.single().file.readText()).isEqualTo("cuit:fg.mp4")
        assertThat(baked.map { it.source to it.look }).containsExactly("bg.mp4" to warm, "fg.mp4" to polaroid)
        assertThat(baked.map { it.author }.distinct()).containsExactly(author)
    }

    @Test fun `a video without a look enters the render as it is`() = runTest {
        val baked = mutableListOf<Baked>()
        val job = preparer(baked).prepare(StoryExportMode.SAVE, scene(mapOf(fgUrl to warm)), folder.newFile("o.mp4"), folder.newFolder("w"))

        assertThat((job.fills.single() as SceneExportSlideFill.Video).file.readText()).isEqualTo("bg.mp4")
        assertThat(job.placedVideos.single().file.readText()).isEqualTo("cuit:fg.mp4")
        assertThat(baked.map { it.source }).containsExactly("fg.mp4")
    }

    @Test fun `a face effect alone is not baked into a video`() = runTest {
        val baked = mutableListOf<Baked>()
        val toad = StoryMediaLook(faceEffect = "toad")
        val job = preparer(baked).prepare(StoryExportMode.SAVE, scene(mapOf(bgUrl to toad)), folder.newFile("o.mp4"), folder.newFolder("w"))

        assertThat((job.fills.single() as SceneExportSlideFill.Video).file.readText()).isEqualTo("bg.mp4")
        assertThat(baked).isEmpty()
    }

    @Test fun `a set video that does not bake stops the export instead of rendering the original`() = runTest {
        val failure = assertThrows(IllegalStateException::class.java) {
            kotlinx.coroutines.runBlocking {
                preparer(mutableListOf(), bakes = false).prepare(StoryExportMode.SAVE, scene(mapOf(bgUrl to warm)), folder.newFile("o.mp4"), folder.newFolder("w"))
            }
        }
        assertThat(failure).hasMessageThat().contains("look")
    }
}

package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.RetouchVideoLook
import me.meeshy.sdk.media.scene.SceneExportSlideFill
import me.meeshy.sdk.media.scene.SceneExportVideoLook
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #15224 — le filtre de diapo (« B&W » de la rangée du haut des Filtres) que l'aperçu peint sur le fond n'entrait pas dans
 * la vidéo enregistrée ou partagée. La scène exportée porte désormais le look de sa diapo sur sa vidéo de fond, comme le
 * lecteur le lit ([StorySlideView.lookRecipe]) et comme iOS (`StoryBackgroundLook`).
 */
class StoryExportSlideFilterTest {

    @get:Rule val folder = TemporaryFolder()

    private val base = "https://gate.meeshy.me"
    private val videoUrl = "$base/api/v1/attachments/file/fond.mp4"
    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 Oct 2026", "10:42"), "24 Oct 2026")
    private val grey = SceneLookRecipe.forStory(StoryFilter.BW, 1f, adjustments = null, isVideo = true)

    private val item = StoryItem(
        id = "story-1",
        media = listOf(FeedMedia(id = "m-bg", type = FeedMediaType.VIDEO, url = "/api/v1/attachments/file/fond.mp4")),
        storyEffects = StoryEffects(
            filter = "bw",
            mediaObjects = listOf(StoryMediaObject(id = "m-bg", postMediaId = "m-bg", mediaType = "video", isBackground = true, duration = 4.0)),
        ),
    )

    private fun slide(look: SceneLookRecipe, looks: StorySceneMediaLooks? = null) = StorySlideView(
        id = "story-1",
        text = "",
        isTranslated = false,
        imageUrl = null,
        accentHex = "112233",
        backgroundVideoUrl = videoUrl,
        lookRecipe = look,
        composerLooks = looks,
    )

    private fun preparer(resolve: StoryExportLookResolver = { _, _, _, _ -> null }) = StoryVideoExportPreparer(
        fetch = { url, target -> target.writeText(url.substringAfterLast('/')) },
        probeMillis = { 4_000L },
        blankPicture = { it.writeText("noir") },
        paint = { request -> request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } } },
        exportLook = resolve,
    )

    private suspend fun backgroundOf(view: StorySlideView, resolve: StoryExportLookResolver = { _, _, _, _ -> null }): SceneExportSlideFill.Video {
        val job = preparer(resolve).prepare(StoryExportMode.SAVE, StoryExportSubject.of(item, view, base), view, folder.newFile(), folder.newFolder())
        return job.fills.single() as SceneExportSlideFill.Video
    }

    @Test fun `une video de fond sous un filtre de diapo part sous sa matrice`() = runTest {
        val fill = backgroundOf(slide(grey))

        assertThat(fill.look?.scene).isEqualTo(SceneLookMatrix.composed(grey))
    }

    @Test fun `le filtre de diapo se pose par-dessus le look propre de la video reglee`() = runTest {
        val own = SceneExportVideoLook(null, RetouchVideoLook.NONE)
        val looks = StorySceneMediaLooks(mapOf(videoUrl to StoryMediaLook(filterPreset = "warm")), author)

        val fill = backgroundOf(slide(grey, looks)) { _, _, _, _ -> own }

        assertThat(fill.look?.scene).isEqualTo(SceneLookMatrix.composed(grey))
        assertThat(fill.look?.look).isSameInstanceAs(own.look)
    }

    @Test fun `sans filtre de diapo, la video de fond nue part sans aucun look`() = runTest {
        assertThat(backgroundOf(slide(SceneLookRecipe.NEUTRAL)).look).isNull()
    }
}

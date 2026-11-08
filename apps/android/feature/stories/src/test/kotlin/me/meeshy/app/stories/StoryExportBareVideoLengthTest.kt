package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.scene.SceneExportSlideFill
import me.meeshy.sdk.model.FeedMedia
import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.scene.export.StoryExportMode
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * #15225 — une vidéo de 30 s posée seule sur une diapo vierge, sans filtre de diapo, s'enregistrait en 6 s alors que la
 * diapo affichait 30 s : la diapo part sans effets (« la publication d'avant, sans scène »), et la durée ne lisait que les
 * effets. La vidéo que le lecteur résout pour fond donne désormais sa durée, comme iOS (`legacyVideoCarrier`).
 */
class StoryExportBareVideoLengthTest {

    @get:Rule val folder = TemporaryFolder()

    private val base = "https://gate.meeshy.me/api/v1"

    private val clip = UploadedMedia("clip", "2026/11/clip/clip.mp4", "video/mp4", 10L, 720, 1280, 30_013L, "2026/11/clip/poster.jpg")

    private val bare = StoryComposerUiState(
        deck = StorySlideDeck(listOf(StorySlide(id = "s1", mediaIds = listOf("clip"))), "s1"),
        attachments = listOf(clip),
    )

    private val projector = StorySlideProjector(base)

    private fun scene(state: StoryComposerUiState) =
        ComposerSceneExport.scenes(state, "fr", null, base) { item -> projector.project(item, "6366F1", NoContentPreferences) }.single()

    private fun preparer(probed: Long) = StoryVideoExportPreparer(
        fetch = { url, target -> target.writeText(url) },
        probeMillis = { probed },
        blankPicture = { it.writeText("noir") },
        paint = { request -> request.frames.mapIndexed { i, _ -> File(request.directory, "calque-$i.png").also { it.writeText("png") } } },
    )

    @Test fun `la diapo nue part sans effets et le lecteur la joue toute la duree de sa video`() {
        val (item, view) = scene(bare)

        assertThat(item.storyEffects).isNull()
        assertThat(view.backgroundVideoUrl).isNotNull()
        assertThat(view.autoAdvanceMillis).isEqualTo(30_000)
    }

    @Test fun `l export de la diapo nue couvre toute sa video`() = runTest {
        val (item, view) = scene(bare)

        val job = preparer(probed = 29_913L).prepare(
            StoryExportMode.SAVE, StoryExportScene.of(item, view, base).subject, view, folder.newFile("out.mp4"), folder.newFolder("work"),
        )

        assertThat(job.plan.totalMillis).isEqualTo(29_913)
        val fill = job.fills.single() as SceneExportSlideFill.Video
        assertThat(fill.laps.sumOf { it.durationMillis }).isEqualTo(29_913)
        assertThat(fill.hold).isNull()
    }

    @Test fun `une story publiee sans effets se lit toute la duree de sa video, et une photo seule six secondes`() {
        val video = StoryItem(id = "v", media = listOf(FeedMedia(id = "m", type = FeedMediaType.VIDEO, url = "/v.mp4", duration = 30)))
        val photo = StoryItem(id = "p", media = listOf(FeedMedia(id = "m", type = FeedMediaType.IMAGE, url = "/p.jpg", duration = 30)))

        assertThat(projector.project(video, "6366F1", NoContentPreferences).autoAdvanceMillis).isEqualTo(30_000)
        assertThat(projector.project(photo, "6366F1", NoContentPreferences).autoAdvanceMillis).isEqualTo(6_000)
    }
}

package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.montage.CallMontageChoice
import me.meeshy.sdk.model.call.montage.CallMontageStyle
import me.meeshy.sdk.model.composer.look.ComposerLookStripItem
import me.meeshy.sdk.model.composer.look.ComposerPhotoFrame
import me.meeshy.sdk.model.media.TusUploadContext
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13841 — le look d'une VIDÉO de la story (filtre et cadre de l'appel) : un réglage comme pour une image, peint en direct
 * par le lecteur vivant de la scène, cuit à la publication par Media3 en copie dérivée ; la charge ne nomme que la copie.
 */
@RunWith(JUnit4::class)
class StoryVideoMediaLookTest {
    private val warm = ComposerLookStripItem.Filter(VideoFilterPreset.Warm)
    private val polaroid = ComposerLookStripItem.Frame(ComposerPhotoFrame.Montage(CallMontageChoice.Classic(CallMontageStyle.POLAROID)))

    private fun media(id: String, mime: String) =
        UploadedMedia(id = id, url = "2026/11/$id/clip.mp4", mimeType = mime, fileSize = 1, width = 1080, height = 1920, durationMs = 8_000, thumbnailUrl = "2026/11/$id/thumb.jpg")

    private fun state(placed: List<String> = listOf("v1"), background: String? = null, images: Set<String> = emptySet()): StoryComposerUiState {
        val ids = (listOfNotNull(background) + placed).distinct()
        val slide = StorySlide(id = "s", mediaIds = ids, backgroundMediaId = background, placedMedia = placed.map { StoryPlacedMedia(it) })
        return StoryComposerUiState(
            deck = StorySlideDeck(listOf(slide), "s"),
            attachments = ids.map { media(it, if (it in images) "image/jpeg" else "video/mp4") },
        )
    }

    @Test
    fun `choisir un filtre puis un cadre sur une video ecrit son look, sans changer son fichier`() {
        val looked = StoryComposerLookReducer.chosen(StoryComposerLookReducer.chosen(state(), "v1", warm), "v1", polaroid)

        assertThat(looked.mediaLookOf("v1")).isEqualTo(StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid"))
        assertThat(looked.deck.selectedSlide.placedMedia.single().mediaId).isEqualTo("v1")
    }

    @Test
    fun `le lecteur vivant d une video posee recoit son look, sa taille servie et son affiche`() {
        val looked = StoryComposerLookReducer.chosen(state(), "v1", warm)

        val cue = looked.liveCues(mediaBaseUrl = null) { null }.single { it.subject.id == "v1" }

        assertThat(cue.look?.look).isEqualTo(StoryMediaLook(filterPreset = "warm"))
        assertThat(cue.look?.size).isEqualTo(1080 to 1920)
        assertThat(cue.look?.poster).isNotNull()
    }

    @Test
    fun `la video de fond recoit aussi son look, et une video sans look n ouvre aucun pipeline`() {
        val plain = state(placed = emptyList(), background = "bg")
        assertThat(plain.liveCues(mediaBaseUrl = null) { null }.single().look).isNull()

        val looked = StoryComposerLookReducer.chosen(plain, "bg", polaroid)

        assertThat(looked.liveCues(mediaBaseUrl = null) { null }.single().look?.look).isEqualTo(StoryMediaLook(frameId = "classic:polaroid"))
    }

    @Test
    fun `un effet de visage seul ne peint rien sur une video, ni en direct ni sur son affiche`() {
        val base = state()
        val faced = base.copy(deck = base.deck.withSelectedMediaLook("v1", StoryMediaLook(faceEffect = "angel")))

        assertThat(faced.liveCues(mediaBaseUrl = null) { null }.single().look).isNull()
        assertThat(faced.placedMediaFrames(mediaBaseUrl = null).single().paintedLook).isNull()
        assertThat(StoryPublicationLookBake.jobs(faced)).isEmpty()
    }

    @Test
    fun `l affiche d une video peint son look, sans l effet de visage`() {
        val base = state()
        val looked = base.copy(deck = base.deck.withSelectedMediaLook("v1", StoryMediaLook(filterPreset = "warm", faceEffect = "angel")))

        assertThat(looked.placedMediaFrames(mediaBaseUrl = null).single().paintedLook).isEqualTo(StoryMediaLook(filterPreset = "warm"))
    }

    @Test
    fun `pendant Comparer la video comparee cede sa place a son affiche, les autres jouent`() {
        val slot = { id: String -> ComposerLiveSlot(me.meeshy.sdk.model.composer.live.ComposerLiveSubject(id, me.meeshy.sdk.model.composer.live.ComposerLiveKind.VIDEO, background = false), mockk(relaxed = true)) }
        val stage = ComposerLiveStage(mapOf("v1" to slot("v1"), "v2" to slot("v2")))

        val compared = stage.comparing("v1")

        assertThat(compared.placed("v1")).isNull()
        assertThat(compared.placed("v2")).isNotNull()
        assertThat(stage.comparing(null)).isSameInstanceAs(stage)
    }

    @Test
    fun `la publication cuit la video reglee, en video, et la charge ne nomme que la copie`() = runTest {
        val looked = StoryComposerLookReducer.chosen(state(placed = listOf("v1", "m1"), images = setOf("m1")), "v1", warm)

        val jobs = StoryPublicationLookBake.jobs(looked)
        assertThat(jobs.map { it.mediaId to it.video }).containsExactly("v1" to true)

        val baked = MediaUploadItem(byteArrayOf(1), "story-look-v1.mp4", "video/mp4")
        val queue: MediaUploadQueue = mockk()
        coEvery { queue.enqueue(baked, TusUploadContext.STORY) } returns "cmid-v1"
        val oven = StoryLookOven(bake = { job -> baked.takeIf { job.video } }, queue = queue, uploader = mockk())

        val sent = oven.queued(looked)

        assertThat(sent.deck.selectedSlide.placedMedia.map { it.mediaId }).containsExactly("cmid-v1", "m1").inOrder()
        assertThat(sent.deck.selectedSlide.mediaLooks).isEmpty()
        val plan = publishPlans(sent, "fr").single()
        assertThat(plan.request.mediaIds).containsExactly("cmid-v1", "m1").inOrder()
        assertThat(plan.dependsOn).containsExactly("cmid-v1")
    }
}

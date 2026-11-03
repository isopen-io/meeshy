package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13841 — « Aperçu » et l'export (Enregistrer, Partager) jouent la composition telle qu'elle sera LUE : les filtres,
 * effets et cadres posés sur ses médias, que la publication cuira, s'y voient — jamais l'original nu.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryComposerPreviewLookTest {
    private val base = "https://gate.meeshy.me/api/v1"
    private val warm = StoryMediaLook(filterPreset = "warm")
    private val polaroid = StoryMediaLook(frameId = "classic:polaroid")
    private val author = ComposerLookAuthor("self", "Ana", null, CallMontageCaption(CallMontageCaption.BRAND_TITLE, "24 Oct 2026", "10:42"), "24 Oct 2026")

    private fun photo(id: String) = UploadedMedia(id, "2026/11/$id/photo.jpg", "image/jpeg", 10L, 1080, 1920, null, null)

    private fun clip(id: String) = UploadedMedia(id, "2026/11/$id/clip.mp4", "video/mp4", 10L, 720, 1280, 6_000L, "2026/11/$id/poster.jpg")

    private fun slide(id: String, background: String, placed: List<String>, looks: Map<String, StoryMediaLook>) = StorySlide(
        id = id,
        mediaIds = listOf(background) + placed,
        backgroundMediaId = background,
        placedMedia = placed.map { StoryPlacedMedia(it) },
        mediaLooks = looks,
    )

    private fun state(vararg slides: StorySlide, videos: Set<String> = emptySet()) = StoryComposerUiState(
        deck = StorySlideDeck(slides.toList(), slides.first().id),
        attachments = slides.flatMap { it.mediaIds }.distinct().map { if (it in videos) clip(it) else photo(it) },
    )

    private fun StoryComposerUiState.scenes() =
        ComposerSceneExport.scenes(this, "fr", null, base, author) { item -> StorySlideProjector(base).project(item, "#6366F1", NoContentPreferences) }

    @Test
    fun `each scene carries the looks of its own slide, by the address the player loads`() {
        val state = state(
            slide("a", "bg", listOf("p"), mapOf("bg" to warm, "p" to polaroid)),
            slide("b", "bg2", emptyList(), emptyMap()),
        )

        val looks = StoryComposerPreview.looks(state, base)

        assertThat(looks).hasSize(2)
        assertThat(looks[0].values.toSet()).containsExactly(warm, polaroid)
        assertThat(looks[1]).isEmpty()
    }

    @Test
    fun `the exported scene paints the look on its background and on its posed media`() {
        val view = state(slide("a", "bg", listOf("p"), mapOf("bg" to warm, "p" to polaroid))).scenes().single().second

        assertThat(view.composerLooks?.of(view.imageUrl)).isEqualTo(warm)
        assertThat(view.composerLooks?.of(view.foregroundMedia.single().url)).isEqualTo(polaroid)
        assertThat(view.composerLooks?.author).isEqualTo(author)
    }

    @Test
    fun `a scene whose media carry no look plays them as they are`() {
        val view = state(slide("a", "bg", listOf("p"), emptyMap())).scenes().single().second

        assertThat(view.composerLooks).isNull()
    }

    @Test
    fun `a published story projected for the reader carries no look`() {
        val item = StoryComposerPreview.items(state(slide("a", "bg", emptyList(), mapOf("bg" to warm))), "fr", null).single()

        assertThat(StorySlideProjector(base).project(item, "#6366F1", NoContentPreferences).composerLooks).isNull()
    }

    @Test
    fun `a set video plays its filter and frame in the preview, at the size the server serves`() {
        val framedWarm = StoryMediaLook(filterPreset = "warm", frameId = "classic:polaroid")
        val view = state(slide("a", "bg", listOf("p"), mapOf("bg" to framedWarm, "p" to warm)), videos = setOf("bg", "p")).scenes().single().second

        val background = view.backgroundVideoUrl!!
        val placed = view.foregroundMedia.single().url
        assertThat(view.composerLooks?.videoLookOf(background)).isEqualTo(framedWarm)
        assertThat(view.composerLooks?.sizeOf(background)).isEqualTo(720 to 1280)
        assertThat(view.composerLooks?.videoLookOf(placed)).isEqualTo(warm)
        assertThat(view.composerLooks?.sizeOf(placed)).isEqualTo(720 to 1280)
    }

    @Test
    fun `a video paints no face effect, in the preview as in the publication`() {
        val toad = StoryMediaLook(filterPreset = "warm", faceEffect = "toad")
        val view = state(slide("a", "bg", emptyList(), mapOf("bg" to toad)), videos = setOf("bg")).scenes().single().second

        assertThat(view.composerLooks?.videoLookOf(view.backgroundVideoUrl)).isEqualTo(toad.copy(faceEffect = null))
    }
}

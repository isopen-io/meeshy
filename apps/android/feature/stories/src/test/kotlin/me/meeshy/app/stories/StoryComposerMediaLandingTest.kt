package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/**
 * R4 de #13863 : un média est un objet de la scène. Le premier d'une diapo vide en devient le fond, le suivant se pose en
 * premier plan, sur la scène, tout de suite et sélectionné — plus de « Mettre sur la scène » obligatoire —, et une série
 * fonde une diapo par média. #13853 : un média posé n'est jamais aussi le fond.
 */
class StoryComposerMediaLandingTest {

    private fun uploaded(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, 3, 4, null, null)

    private fun pick(state: StoryComposerUiState, vararg ids: String): StoryComposerUiState =
        StoryComposerUploadReducer.uploaded(StoryComposerUploadReducer.started(state, ids.size), ids.map(::uploaded))

    private val empty = StoryComposerUiState()

    @Test
    fun `the first media of an empty slide becomes its background and nothing is posed`() {
        val state = pick(empty, "m1")

        assertThat(state.selectedSlideBackdropMediaId).isEqualTo("m1")
        assertThat(state.deck.selectedSlide.placedMedia).isEmpty()
    }

    @Test
    fun `the next media is posed on the scene at once, selected, over the background`() {
        val state = pick(pick(empty, "m1"), "m2")

        assertThat(state.deck.selectedSlide.placedMedia.map { it.mediaId }).containsExactly("m2")
        assertThat(state.selectedSlideBackdropMediaId).isEqualTo("m1")
        assertThat(state.selectedMedia).isEqualTo("m2")
        assertThat(state.deck.size).isEqualTo(1)
    }

    @Test
    fun `a pick of several media founds one slide per media, each its background`() {
        val state = pick(empty, "m1", "m2", "m3")

        assertThat(state.deck.slides.map { it.mediaIds }).containsExactly(listOf("m1"), listOf("m2"), listOf("m3")).inOrder()
        assertThat(state.deck.slides.flatMap { it.placedMedia }).isEmpty()
    }

    @Test
    fun `a media kept for later on a slide that has a background is posed too, as a placeholder`() {
        val withBackground = pick(empty, "m1")
        val item = MediaUploadItem(byteArrayOf(1), "b.jpg", "image/jpeg")

        val state = StoryComposerUploadReducer.queued(StoryComposerUploadReducer.started(withBackground, 1), cmid = "cmid_2", item = item, index = 0)

        assertThat(state.deck.selectedSlide.placedMedia.map { it.mediaId }).containsExactly("cmid_2")
        assertThat(state.selectedSlideBackdropMediaId).isEqualTo("m1")
    }

    @Test
    fun `a media posed on the scene is never painted as the background too`() {
        val alone = StoryComposerUiState(
            deck = StorySlideDeck(listOf(StorySlide(id = "s", mediaIds = listOf("m"))), "s"),
            attachments = listOf(uploaded("m")),
        )

        val posed = StoryComposerPlacedMediaReducer.placed(alone, "m")

        assertThat(posed.selectedSlideBackdropMediaId).isNull()
        assertThat(posed.sceneBackgroundMediaId).isNull()
        assertThat(posed.thumbnailBackgroundOf(posed.deck.selectedSlide, null)).isNull()
        assertThat(posed.placedMediaFrames(null).map { it.key }).containsExactly("m")
    }
}

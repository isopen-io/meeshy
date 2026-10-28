package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UploadedMedia
import org.junit.Test

/** #13604 : le plateau peint le fond que la publication désigne, jamais « le premier média » quand un autre est désigné. */
class StoryBackdropModelTest {
    private fun media(id: String) =
        UploadedMedia(id = id, url = "https://cdn/$id", mimeType = "image/jpeg", fileSize = 1, width = 10, height = 10, durationMs = null, thumbnailUrl = null)

    private fun state(vararg ids: String): StoryComposerUiState {
        val deck = ids.fold(StorySlideDeck.single("s")) { acc, id -> acc.addMediaToSelected(id) }
        return StoryComposerUiState(deck = deck, attachments = ids.map(::media)).mirrorDraftToSelection()
    }

    @Test
    fun `sans fond designe le plateau peint le premier media`() {
        assertThat(state("a", "b").selectedSlideBackdropModel).isEqualTo("https://cdn/a")
    }

    @Test
    fun `le fond designe est peint a la place du premier media`() {
        val designated = StoryComposerBackgroundReducer.backgroundMediaToggled(state("a", "b"), "b")
        assertThat(designated.selectedSlideBackdropModel).isEqualTo("https://cdn/b")
    }

    @Test
    fun `retirer la designation rend le plateau au premier media`() {
        val designated = StoryComposerBackgroundReducer.backgroundMediaToggled(state("a", "b"), "b")
        val cleared = StoryComposerBackgroundReducer.backgroundMediaToggled(designated, "b")
        assertThat(cleared.selectedSlideBackdropModel).isEqualTo("https://cdn/a")
    }
}

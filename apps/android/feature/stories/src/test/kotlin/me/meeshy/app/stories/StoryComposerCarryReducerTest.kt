package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.CarriedMedia
import me.meeshy.sdk.model.composer.ComposerCarry
import me.meeshy.sdk.model.composer.ComposerMediaTransfer
import org.junit.Test

class StoryComposerCarryReducerTest {
    private fun media(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, null, null, null, null)

    private fun carry(
        add: List<CarriedMedia> = emptyList(),
        remove: Set<String> = emptySet(),
        audience: StoryVisibility? = null,
    ): ComposerCarry {
        val plan = ComposerMediaTransfer.plan(add, emptyList(), emptySet(), room = 10)
        return ComposerCarry(ComposerCarry.Side.SCENE, plan.copy(remove = remove), audience, token = 1)
    }

    @Test
    fun `two post photos land on the selected slide, uploaded once, with their alt`() {
        val next = StoryComposerCarryReducer.applied(
            StoryComposerUiState(),
            carry(listOf(CarriedMedia(media("a"), "chat"), CarriedMedia(media("b")))),
        )
        assertThat(next.deck.selectedSlide.mediaIds).containsExactly("a", "b").inOrder()
        assertThat(next.attachments.map { it.id }).containsExactly("a", "b")
        assertThat(next.draft.mediaAlt).containsExactly("a", "chat")
        assertThat(next.carriedMedia.map { it.media.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `a media removed on the post leaves the deck with its description`() {
        val base = StoryComposerCarryReducer.applied(StoryComposerUiState(), carry(listOf(CarriedMedia(media("a"), "chat"), CarriedMedia(media("b")))))
        val next = StoryComposerCarryReducer.applied(base, carry(remove = setOf("a")))
        assertThat(next.deck.selectedSlide.mediaIds).containsExactly("b")
        assertThat(next.attachments.map { it.id }).containsExactly("b")
        assertThat(next.draft.mediaAlt).isEmpty()
    }

    @Test
    fun `a carried audience applies, one that needs a pick never does`() {
        assertThat(StoryComposerCarryReducer.applied(StoryComposerUiState(), carry(audience = StoryVisibility.FRIENDS)).draft.visibility)
            .isEqualTo(StoryVisibility.FRIENDS)
        assertThat(StoryComposerCarryReducer.applied(StoryComposerUiState(), carry(audience = StoryVisibility.ONLY)).draft.visibility)
            .isEqualTo(StoryVisibility.PUBLIC)
    }

    @Test
    fun `a media already on the deck is not attached a second time`() {
        val once = StoryComposerCarryReducer.applied(StoryComposerUiState(), carry(listOf(CarriedMedia(media("a")))))
        val twice = StoryComposerCarryReducer.applied(once, carry(listOf(CarriedMedia(media("a")))))
        assertThat(twice.attachments).hasSize(1)
        assertThat(twice.deck.selectedSlide.mediaIds).containsExactly("a")
    }
}

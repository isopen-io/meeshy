package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.StoryPublishTitle
import org.junit.Test

class StoryEditChromeTest {

    private val opening = StoryEditFixtures.opening()

    private fun ring(displayed: String?, count: Int = 1) = StoryRing(
        userId = "me", displayName = "Moi", avatarUrl = null, accentHex = "6366F1",
        hasUnviewed = false, storyCount = count, unviewedCount = 0, isMine = true, displayedStoryId = displayed,
    )

    @Test
    fun `en edition le bouton enregistre, y compris quand la scene tiendrait plusieurs slides`() {
        val opened = StoryEditFixtures.opened(opening)
        assertThat(opened.publishTitle).isEqualTo(StoryPublishTitle.Save)

        val twoSlides = opened.copy(deck = opened.deck.addSlide("extra"))
        assertThat(twoSlides.publishTitle).isEqualTo(StoryPublishTitle.Save)
    }

    @Test
    fun `hors edition le bouton publie comme avant`() {
        assertThat(StoryComposerUiState().publishTitle).isEqualTo(StoryPublishTitle.Single)
    }

    @Test
    fun `en edition l'ajout et la duplication de slide sont fermes d'avance, avec leur explication`() {
        val opened = StoryEditFixtures.opened(opening)
        assertThat(opened.canAddSlide).isFalse()
        assertThat(opened.addSlideRefusalRes()).isEqualTo(me.meeshy.feature.stories.R.string.story_edit_no_add_slide)
        assertThat(StoryComposerUiState().canAddSlide).isTrue()
        assertThat(StoryComposerUiState().addSlideRefusalRes()).isEqualTo(me.meeshy.feature.stories.R.string.composer_slide_rail_capReached)
    }

    @Test
    fun `l'interrupteur d'extraction du son reprend celui du post rouvert`() {
        val on = opening.copy(post = opening.post.copy(allowSoundExtraction = true))
        val off = opening.copy(post = opening.post.copy(allowSoundExtraction = false))

        assertThat(StoryEditFixtures.opened(on).draft.allowSoundExtraction).isTrue()
        assertThat(StoryEditFixtures.opened(off).draft.allowSoundExtraction).isFalse()
        assertThat(StoryEditFixtures.opened(opening).draft.allowSoundExtraction).isNull()
    }

    @Test
    fun `le menu de sa story au rail offre Modifier apres Voir, seulement si l'anneau montre une story`() {
        assertThat(StoryTraySelfMenu.actions(ring("s1"), canEdit = true))
            .containsExactly(StoryTraySelfAction.ViewMyStory, StoryTraySelfAction.EditStory, StoryTraySelfAction.ManageStories, StoryTraySelfAction.AddStory)
            .inOrder()
        assertThat(StoryTraySelfMenu.actions(ring(null), canEdit = true)).doesNotContain(StoryTraySelfAction.EditStory)
        assertThat(StoryTraySelfMenu.actions(ring("s1", count = 0), canEdit = true)).doesNotContain(StoryTraySelfAction.EditStory)
        assertThat(StoryTraySelfMenu.actions(ring("s1"))).doesNotContain(StoryTraySelfAction.EditStory)
        assertThat(StoryTraySelfMenu.actions(null, canEdit = true)).doesNotContain(StoryTraySelfAction.EditStory)
    }

    @Test
    fun `le lecteur offre Modifier sur sa story vivante seulement`() {
        assertThat(StoryEditEntry.offered(isOwnStory = true, storyId = "s1")).isTrue()
        assertThat(StoryEditEntry.offered(isOwnStory = false, storyId = "s1")).isFalse()
        assertThat(StoryEditEntry.offered(isOwnStory = true, storyId = null)).isFalse()
        assertThat(StoryEditEntry.offered(isOwnStory = true, storyId = "s1", expired = true)).isFalse()
    }
}

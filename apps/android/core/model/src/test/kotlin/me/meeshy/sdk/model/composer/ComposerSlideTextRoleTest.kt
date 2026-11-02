package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerFormat.POST
import me.meeshy.sdk.model.composer.ComposerFormat.REEL
import me.meeshy.sdk.model.composer.ComposerFormat.STATUS
import me.meeshy.sdk.model.composer.ComposerFormat.STORY
import org.junit.Test

class ComposerSlideTextRoleTest {
    @Test
    fun `the text of a slide is the content in story reel and mood, the caption of ONE media in a post`() {
        assertThat(listOf(STORY, REEL, STATUS).map { ComposerSlideTextRole.of(it) }.toSet())
            .containsExactly(ComposerSlideTextRole.CONTENT)
        assertThat(ComposerSlideTextRole.of(POST)).isEqualTo(ComposerSlideTextRole.CAPTION)
    }

    @Test
    fun `only a caption needs a media to belong to`() {
        assertThat(ComposerSlideTextRole.CAPTION.needsMediaTarget).isTrue()
        assertThat(ComposerSlideTextRole.CONTENT.needsMediaTarget).isFalse()
    }

    @Test
    fun `the description field writes where the role and the media say`() {
        assertThat(ComposerSlideTextRole.descriptionTarget(STORY, "a.jpg")).isEqualTo(DescriptionTarget.SlideContent)
        assertThat(ComposerSlideTextRole.descriptionTarget(POST, "a.jpg")).isEqualTo(DescriptionTarget.MediaCaption("a.jpg"))
        assertThat(ComposerSlideTextRole.descriptionTarget(POST, null)).isEqualTo(DescriptionTarget.PostContent)
        assertThat(ComposerSlideTextRole.descriptionTarget(REEL, null)).isEqualTo(DescriptionTarget.SlideContent)
    }
}

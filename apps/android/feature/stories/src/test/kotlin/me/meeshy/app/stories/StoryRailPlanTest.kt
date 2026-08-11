package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Membership of the story viewer's right-side rail — Android mirror of the
 * iOS StoryActionRailPlan rules for the two buttons this viewer ships:
 * react (viewers only, never the author) and language (whenever the slide
 * has translatable content, author included — the Prisme is a reading tool,
 * not a permission).
 */
class StoryRailPlanTest {

    @Test
    fun `a viewer sees the react button`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false).showsReact).isTrue()
    }

    @Test
    fun `the author never sees the react button`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = true).showsReact).isFalse()
    }

    @Test
    fun `translatable content shows the language button even for the author`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = true).showsLanguage).isTrue()
    }

    @Test
    fun `no translatable content hides the language button`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false).showsLanguage).isFalse()
    }
}

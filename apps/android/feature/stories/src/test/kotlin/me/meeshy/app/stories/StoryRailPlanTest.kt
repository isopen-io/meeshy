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

    @Test
    fun `reply is offered on somebody else's story that can be answered, never on one's own`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, canReply = true).showsReply).isTrue()
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false, canReply = true).showsReply).isFalse()
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, canReply = false).showsReply).isFalse()
    }

    // #14313 — le rail d'iOS (`StoryActionRailPlan`) : Envoyer pour tous, Republier ou Vues selon l'auteur,
    // Composer chez autrui, Commentaires dès qu'il y en a un.

    @Test
    fun `send is offered to everyone, author included`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false).showsSend).isTrue()
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false).showsSend).isTrue()
    }

    @Test
    fun `a viewer can repost, the author sees the views instead`() {
        val viewer = StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false)
        val author = StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false)
        assertThat(viewer.showsRepost to viewer.showsViews).isEqualTo(true to false)
        assertThat(author.showsRepost to author.showsViews).isEqualTo(false to true)
    }

    @Test
    fun `compose is offered on somebody else's story that can be composed from`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, canCompose = true).showsCompose).isTrue()
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false, canCompose = true).showsCompose).isFalse()
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, canCompose = false).showsCompose).isFalse()
    }

    @Test
    fun `comments show from the first comment, for everyone`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, commentCount = 0).showsComments).isFalse()
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false, commentCount = 1).showsComments).isTrue()
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false, commentCount = 3).showsComments).isTrue()
    }

    @Test
    fun `the comment composer is pinned under somebody else's story only`() {
        assertThat(StoryRailPlan.resolve(isOwnStory = false, hasTranslatableContent = false).pinsCommentComposer).isTrue()
        assertThat(StoryRailPlan.resolve(isOwnStory = true, hasTranslatableContent = false).pinsCommentComposer).isFalse()
    }
}

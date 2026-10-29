package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** #13501 — répondre à une story : qui peut le faire, ce que la citation montre, quand l'envoi part. */
class StoryReplyRulesTest {

    @Test
    fun `one replies to somebody else's story, never to one's own nor to an unknown author`() {
        assertThat(StoryReplyRules.canReply(isOwnStory = false, storyId = "s1", authorId = "u1")).isTrue()
        assertThat(StoryReplyRules.canReply(isOwnStory = true, storyId = "s1", authorId = "u1")).isFalse()
        assertThat(StoryReplyRules.canReply(isOwnStory = false, storyId = null, authorId = "u1")).isFalse()
        assertThat(StoryReplyRules.canReply(isOwnStory = false, storyId = "s1", authorId = null)).isFalse()
        assertThat(StoryReplyRules.canReply(isOwnStory = false, storyId = "s1", authorId = " ")).isFalse()
    }

    @Test
    fun `the quote shows the first 80 characters of the story, trimmed, or nothing when the story has no words`() {
        assertThat(StoryReplyRules.quotePreview("  Bonjour  ")).isEqualTo("Bonjour")
        assertThat(StoryReplyRules.quotePreview("x".repeat(200))).hasLength(StoryReplyRules.PREVIEW_MAX)
        assertThat(StoryReplyRules.quotePreview("   ")).isNull()
        assertThat(StoryReplyRules.quotePreview(null)).isNull()
    }

    @Test
    fun `a reply leaves only with words, once at a time`() {
        assertThat(StoryReplyRules.canSend(canReply = true, isSending = false, text = "trop bien")).isTrue()
        assertThat(StoryReplyRules.canSend(canReply = true, isSending = true, text = "trop bien")).isFalse()
        assertThat(StoryReplyRules.canSend(canReply = true, isSending = false, text = "  ")).isFalse()
        assertThat(StoryReplyRules.canSend(canReply = false, isSending = false, text = "trop bien")).isFalse()
    }

    @Test
    fun `the rail offers the reply to the reader of somebody else's story`() {
        assertThat(StoryReplyRules.railOffersReply(isOwnStory = false, canReply = true)).isTrue()
        assertThat(StoryReplyRules.railOffersReply(isOwnStory = true, canReply = true)).isFalse()
        assertThat(StoryReplyRules.railOffersReply(isOwnStory = false, canReply = false)).isFalse()
    }
}

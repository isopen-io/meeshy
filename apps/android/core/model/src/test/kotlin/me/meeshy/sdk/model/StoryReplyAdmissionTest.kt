package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.OutgoingStoryReplyRoute
import me.meeshy.sdk.model.story.StoryReplyContext
import org.junit.Test

class StoryReplyAdmissionTest {

    private fun story(author: String = "author") = StoryReplyContext.Story(replyToId = "s1", authorId = author)

    @Test
    fun `the direct conversation with the author admits the reply`() {
        assertThat(StoryReplyAdmission.admits("author", conversationIsDirect = true, participantUserId = "author")).isTrue()
    }

    @Test
    fun `a group never admits a story reply`() {
        assertThat(StoryReplyAdmission.admits("author", conversationIsDirect = false, participantUserId = "author")).isFalse()
    }

    @Test
    fun `the direct conversation of a third party refuses the reply`() {
        assertThat(StoryReplyAdmission.admits("author", conversationIsDirect = true, participantUserId = "other")).isFalse()
    }

    @Test
    fun `an absent or empty identifier is refused, even when both are empty`() {
        assertThat(StoryReplyAdmission.admits(null, true, null)).isFalse()
        assertThat(StoryReplyAdmission.admits("", true, "")).isFalse()
        assertThat(StoryReplyAdmission.admits("author", true, null)).isFalse()
        assertThat(StoryReplyAdmission.admits(null, true, "author")).isFalse()
        assertThat(StoryReplyAdmission.admits("author", true, "")).isFalse()
    }

    @Test
    fun `the route carries the story id only where the reply is admitted`() {
        assertThat(OutgoingStoryReplyRoute.of(story(), true, "author").storyReplyToId).isEqualTo("s1")
        assertThat(OutgoingStoryReplyRoute.of(story(), false, "author").hasReply).isFalse()
        assertThat(OutgoingStoryReplyRoute.of(story(), true, "other").hasReply).isFalse()
        assertThat(OutgoingStoryReplyRoute.of(null, true, "author").hasReply).isFalse()
    }

    @Test
    fun `a status context routes by the id of the mood`() {
        val mood = StoryReplyContext.Status(replyToId = "m1", authorId = "author")
        assertThat(OutgoingStoryReplyRoute.of(mood, true, "author").storyReplyToId).isEqualTo("m1")
    }

    @Test
    fun `a context with an empty reply id routes nothing`() {
        val empty = StoryReplyContext.Story(replyToId = "", authorId = "author")
        assertThat(OutgoingStoryReplyRoute.of(empty, true, "author").hasReply).isFalse()
    }
}

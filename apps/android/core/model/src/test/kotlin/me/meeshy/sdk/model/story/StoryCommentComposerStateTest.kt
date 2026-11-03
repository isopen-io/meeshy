package me.meeshy.sdk.model.story

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryComment
import me.meeshy.sdk.model.StoryCommentStatus
import me.meeshy.sdk.model.appearance.PaintRoleResolver
import org.junit.Test

class StoryCommentComposerStateTest {

    private fun comment(id: String, parentId: String? = null) = StoryComment(
        id = id, clientId = null, authorName = "Alice", avatarUrl = null, content = "Salut",
        isTranslated = false, createdAt = null, status = StoryCommentStatus.Sent, parentId = parentId,
    )

    private fun bar(reply: StoryCommentReplyTarget? = null) = StoryCommentComposerState("#6366F1", reply)

    @Test
    fun `the accent is the story's until a comment is targeted, then the comment author's`() {
        assertThat(bar().accentHex).isEqualTo("#6366F1")
        val targeted = bar().replying(StoryCommentReplyTarget.of(comment("c1"), "#FF2E63"))
        assertThat(targeted.accentHex).isEqualTo("#FF2E63")
        assertThat(targeted.cancelReply().accentHex).isEqualTo("#6366F1")
    }

    @Test
    fun `the second gradient stop is the accent turned by plus thirty degrees`() {
        val state = bar()
        assertThat(state.secondaryHex).isEqualTo(PaintRoleResolver.hueShifted("#6366F1", 30.0))
        assertThat(state.secondaryHex).isNotEqualTo(state.accentHex)
    }

    @Test
    fun `a malformed accent never reaches the paint`() {
        assertThat(StoryCommentComposerState("pas une couleur").accentHex).isEqualTo(PaintRoleResolver.FALLBACK_ACCENT)
    }

    @Test
    fun `the banner shows while replying and cancels to the top level`() {
        val replying = bar().replying(StoryCommentReplyTarget.of(comment("c1"), "#FF2E63"))
        assertThat(replying.showsReplyBanner).isTrue()
        assertThat(replying.reply?.authorName).isEqualTo("Alice")
        val cancelled = replying.cancelReply()
        assertThat(cancelled.showsReplyBanner).isFalse()
        assertThat(cancelled.parentIdForSend).isNull()
    }

    @Test
    fun `replying to a reply attaches to the same root parent`() {
        val toRoot = StoryCommentReplyTarget.of(comment("root"), "#FF2E63")
        val toReply = StoryCommentReplyTarget.of(comment("r1", parentId = "root"), "#FF2E63")
        assertThat(bar(toRoot).parentIdForSend).isEqualTo("root")
        assertThat(bar(toReply).parentIdForSend).isEqualTo("root")
    }

    @Test
    fun `cancelling with no target keeps the same instance and a send consumes the target`() {
        val idle = bar()
        assertThat(idle.cancelReply()).isSameInstanceAs(idle)
        assertThat(bar(StoryCommentReplyTarget.of(comment("c1"), "#FF2E63")).sent().reply).isNull()
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCommentMenuPolicyTest {

    private fun actions(
        authorId: String? = "u-author",
        viewerId: String? = "u-viewer",
        role: String? = "USER",
        text: String = "Bonjour",
        flags: Int? = null,
    ) = StoryCommentMenuPolicy.actions(authorId, viewerId, role, text, flags)

    @Test
    fun `the author copies, edits and deletes but never reports nor removes`() {
        assertThat(actions(viewerId = "u-author", role = "ADMIN")).containsExactly(
            StoryCommentMenuAction.COPY, StoryCommentMenuAction.EDIT, StoryCommentMenuAction.DELETE,
        ).inOrder()
    }

    @Test
    fun `platform moderation removes with a reason what another wrote and may report it`() {
        assertThat(actions(role = "MODERATOR")).containsExactly(
            StoryCommentMenuAction.COPY, StoryCommentMenuAction.REPORT, StoryCommentMenuAction.REMOVE,
        ).inOrder()
    }

    @Test
    fun `another reader copies and reports only`() {
        assertThat(actions()).containsExactly(StoryCommentMenuAction.COPY, StoryCommentMenuAction.REPORT).inOrder()
    }

    @Test
    fun `a protected comment is never copied`() {
        assertThat(actions(flags = MessageEffectFlags.BLURRED.toInt())).containsExactly(StoryCommentMenuAction.REPORT)
    }

    @Test
    fun `an unknown viewer gets nothing to report nor remove`() {
        assertThat(actions(viewerId = null, role = "ADMIN")).containsExactly(StoryCommentMenuAction.COPY)
    }
}

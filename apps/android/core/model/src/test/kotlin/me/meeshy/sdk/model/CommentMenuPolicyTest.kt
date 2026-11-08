package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommentMenuPolicyTest {

    private fun actions(
        authorId: String? = "u-author",
        viewerId: String? = "u-viewer",
        role: String? = "USER",
        text: String = "Bonjour",
        flags: Int? = null,
        canImagine: Boolean = true,
        editable: Boolean = true,
        deletable: Boolean = true,
        removable: Boolean = true,
        closed: Boolean = false,
    ) = CommentMenuPolicy.actions(authorId, viewerId, role, text, flags, canImagine, editable, deletable, removable, commentsClosed = closed)

    @Test
    fun `the author copies, imagines, edits and deletes but never reports nor removes`() {
        assertThat(actions(viewerId = "u-author", role = "ADMIN")).containsExactly(
            CommentMenuAction.COPY, CommentMenuAction.IMAGINE, CommentMenuAction.EDIT, CommentMenuAction.DELETE,
        ).inOrder()
    }

    @Test
    fun `another reader copies, imagines and reports only`() {
        assertThat(actions()).containsExactly(
            CommentMenuAction.COPY, CommentMenuAction.IMAGINE, CommentMenuAction.REPORT,
        ).inOrder()
    }

    @Test
    fun `platform moderation also removes what another wrote`() {
        assertThat(actions(role = "MODERATOR")).containsExactly(
            CommentMenuAction.COPY, CommentMenuAction.IMAGINE, CommentMenuAction.REPORT, CommentMenuAction.REMOVE,
        ).inOrder()
    }

    @Test
    fun `an ordinary reader never removes`() {
        assertThat(actions(role = "USER", removable = true)).doesNotContain(CommentMenuAction.REMOVE)
    }

    @Test
    fun `a protected comment is never copied, whatever protects it`() {
        listOf(MessageEffectFlags.BLURRED, MessageEffectFlags.EPHEMERAL, MessageEffectFlags.VIEW_ONCE).forEach { bit ->
            assertThat(actions(flags = bit.toInt())).doesNotContain(CommentMenuAction.COPY)
        }
    }

    @Test
    fun `a blank served text is not copyable`() {
        assertThat(actions(text = "   ")).doesNotContain(CommentMenuAction.COPY)
    }

    @Test
    fun `imagine follows the verdict of the card`() {
        assertThat(actions(canImagine = false)).doesNotContain(CommentMenuAction.IMAGINE)
    }

    @Test
    fun `a host that cannot edit or delete does not offer them`() {
        assertThat(actions(viewerId = "u-author", editable = false, deletable = false))
            .containsExactly(CommentMenuAction.COPY, CommentMenuAction.IMAGINE)
    }

    @Test
    fun `an unknown viewer neither reports nor edits nor removes`() {
        assertThat(actions(viewerId = null, role = "ADMIN")).containsExactly(CommentMenuAction.COPY, CommentMenuAction.IMAGINE)
    }

    @Test
    fun `a comment is protected by its lifecycle bits only`() {
        assertThat(CommentMenuPolicy.isProtected(null)).isFalse()
        assertThat(CommentMenuPolicy.isProtected(MessageEffectFlags.BLURRED.toInt())).isTrue()
    }

    @Test
    fun `on a closed thread the author no longer edits but still deletes`() {
        assertThat(actions(viewerId = "u-author", closed = true)).containsExactly(
            CommentMenuAction.COPY, CommentMenuAction.IMAGINE, CommentMenuAction.DELETE,
        ).inOrder()
    }

    @Test
    fun `on a closed thread another reader still reports and moderation still removes`() {
        assertThat(actions(role = "MODERATOR", closed = true)).containsExactly(
            CommentMenuAction.COPY, CommentMenuAction.IMAGINE, CommentMenuAction.REPORT, CommentMenuAction.REMOVE,
        ).inOrder()
    }
}

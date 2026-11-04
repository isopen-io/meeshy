package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal
import org.junit.Test

class ConversationSwipePlanTest {

    private fun plan(
        hasUnread: Boolean = false,
        canToggleArchive: Boolean = true,
        removal: Removal? = Removal.HIDE,
        obsolete: Boolean = false,
    ) = ConversationSwipePlan.of(
        hasUnread = hasUnread,
        canToggleArchive = canToggleArchive,
        removal = removal,
        obsolete = obsolete,
    )

    @Test
    fun `leading side offers pin, mute and lock in that order`() {
        assertThat(plan().leading).containsExactly(
            SwipeKind.PIN, SwipeKind.MUTE, SwipeKind.LOCK,
        ).inOrder()
    }

    @Test
    fun `trailing side offers archive, read toggle and hide in that order`() {
        assertThat(plan().trailing).containsExactly(
            SwipeKind.ARCHIVE, SwipeKind.MARK_UNREAD, SwipeKind.REMOVE,
        ).inOrder()
    }

    @Test
    fun `an unread conversation offers mark read, a read one mark unread`() {
        assertThat(plan(hasUnread = true).trailing).contains(SwipeKind.MARK_READ)
        assertThat(plan(hasUnread = true).trailing).doesNotContain(SwipeKind.MARK_UNREAD)
        assertThat(plan(hasUnread = false).trailing).contains(SwipeKind.MARK_UNREAD)
    }

    @Test
    fun `an archive imposed by the gateway hides the archive swipe`() {
        assertThat(plan(canToggleArchive = false).trailing).doesNotContain(SwipeKind.ARCHIVE)
    }

    @Test
    fun `a conversation the law does not let the viewer remove has no remove swipe`() {
        assertThat(plan(removal = null).trailing).doesNotContain(SwipeKind.REMOVE)
    }

    @Test
    fun `each side stays within the actions a row can reveal, four at most when the viewer may make it obsolete`() {
        val full = plan(obsolete = true)
        assertThat(full.leading.size).isAtMost(3)
        assertThat(full.trailing.size).isAtMost(4)
        assertThat(plan().trailing.size).isAtMost(3)
    }

    @Test
    fun `a conversation the gateway lets the viewer make obsolete offers it last, after the remove swipe`() {
        assertThat(plan(obsolete = true).trailing).containsExactly(
            SwipeKind.ARCHIVE, SwipeKind.MARK_UNREAD, SwipeKind.REMOVE, SwipeKind.OBSOLETE,
        ).inOrder()
    }

    @Test
    fun `a conversation the gateway does not let the viewer make obsolete has no obsolete swipe`() {
        assertThat(plan(obsolete = false).trailing).doesNotContain(SwipeKind.OBSOLETE)
        assertThat(plan(obsolete = false).leading).doesNotContain(SwipeKind.OBSOLETE)
    }

    @Test
    fun `the obsolete swipe stays offered when the viewer may not hide the conversation`() {
        assertThat(plan(removal = null, obsolete = true).trailing.last()).isEqualTo(SwipeKind.OBSOLETE)
    }

    @Test
    fun `a direct the viewer deletes still offers the remove swipe last`() {
        assertThat(plan(removal = Removal.DELETE).trailing.last()).isEqualTo(SwipeKind.REMOVE)
    }
}

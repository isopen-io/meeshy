package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal
import org.junit.Test

class ConversationSwipePlanTest {

    private fun plan(
        hasUnread: Boolean = false,
        canToggleArchive: Boolean = true,
        removal: Removal? = Removal.HIDE,
    ) = ConversationSwipePlan.of(
        hasUnread = hasUnread,
        canToggleArchive = canToggleArchive,
        removal = removal,
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
    fun `each side stays within the three actions a row can reveal`() {
        val full = plan()
        assertThat(full.leading.size).isAtMost(3)
        assertThat(full.trailing.size).isAtMost(3)
    }
}

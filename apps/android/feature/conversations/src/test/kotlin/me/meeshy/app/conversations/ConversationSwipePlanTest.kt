package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Consigne porteur du 2026-11-09 (#17244) : silence et verrou quittent le glissement vers la droite,
 * la suppression quitte le glissement vers la gauche — tous restent dans le menu d'appui long.
 */
class ConversationSwipePlanTest {

    private fun plan(
        hasUnread: Boolean = false,
        canToggleArchive: Boolean = true,
        obsolete: Boolean = false,
    ) = ConversationSwipePlan.of(
        hasUnread = hasUnread,
        canToggleArchive = canToggleArchive,
        obsolete = obsolete,
    )

    @Test
    fun `leading side offers pin only, mute and lock living in the long press menu`() {
        assertThat(plan().leading).containsExactly(SwipeKind.PIN)
    }

    @Test
    fun `trailing side offers archive then the read toggle, removal living in the long press menu`() {
        assertThat(plan().trailing).containsExactly(SwipeKind.ARCHIVE, SwipeKind.MARK_UNREAD).inOrder()
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
    fun `each side stays within the actions a row can reveal`() {
        val full = plan(obsolete = true)
        assertThat(full.leading.size).isAtMost(1)
        assertThat(full.trailing.size).isAtMost(3)
    }

    @Test
    fun `a conversation the gateway lets the viewer make obsolete offers it last`() {
        assertThat(plan(obsolete = true).trailing).containsExactly(
            SwipeKind.ARCHIVE, SwipeKind.MARK_UNREAD, SwipeKind.OBSOLETE,
        ).inOrder()
    }

    @Test
    fun `a conversation the gateway does not let the viewer make obsolete has no obsolete swipe`() {
        assertThat(plan(obsolete = false).trailing).doesNotContain(SwipeKind.OBSOLETE)
        assertThat(plan(obsolete = false).leading).doesNotContain(SwipeKind.OBSOLETE)
    }
}

package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Consigne porteur du 2026-11-09 (#17244) : silence et verrou quittent le glissement vers la droite ;
 * supprimer et rendre obsolète vivent dans le menu SEULEMENT — le glissement vers la gauche ne garde
 * qu'archiver et lu / non lu.
 */
class ConversationSwipePlanTest {

    private fun plan(
        hasUnread: Boolean = false,
        canToggleArchive: Boolean = true,
    ) = ConversationSwipePlan.of(
        hasUnread = hasUnread,
        canToggleArchive = canToggleArchive,
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
        assertThat(plan().leading.size).isAtMost(1)
        assertThat(plan().trailing.size).isAtMost(2)
    }

    @Test
    fun `no swipe removes a conversation, delete and make obsolete living in the long press menu only`() {
        assertThat(SwipeKind.entries.map { it.name }).containsNoneOf("REMOVE", "OBSOLETE", "DELETE")
    }
}

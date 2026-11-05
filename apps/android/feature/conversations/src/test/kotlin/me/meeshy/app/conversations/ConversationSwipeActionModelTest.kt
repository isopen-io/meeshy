package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities.Removal
import org.junit.Test

class ConversationSwipeActionModelTest {

    private fun model(
        isPinned: Boolean = false,
        isMuted: Boolean = false,
        isLocked: Boolean = false,
        isArchived: Boolean = false,
        hasUnread: Boolean = false,
        canToggleArchive: Boolean = true,
        removal: Removal? = Removal.HIDE,
        obsolete: Boolean = false,
    ) = ConversationSwipeActionModel.of(
        isPinned = isPinned,
        isMuted = isMuted,
        isLocked = isLocked,
        isArchived = isArchived,
        hasUnread = hasUnread,
        canToggleArchive = canToggleArchive,
        removal = removal,
        obsolete = obsolete,
    )

    private fun ConversationSwipeActionModel.leadingState() = leading.associate { it.kind to it.active }

    @Test
    fun `leading side carries the pinned, muted and locked state of the row`() {
        val state = model(isPinned = true, isMuted = true, isLocked = true).leadingState()

        assertThat(state).containsExactly(SwipeKind.PIN, true, SwipeKind.MUTE, true, SwipeKind.LOCK, true).inOrder()
    }

    @Test
    fun `a plain row offers pin, mute and lock in their initial state`() {
        assertThat(model().leadingState())
            .containsExactly(SwipeKind.PIN, false, SwipeKind.MUTE, false, SwipeKind.LOCK, false).inOrder()
    }

    @Test
    fun `an archived row offers the archive action in its unarchive state`() {
        val archive = model(isArchived = true).trailing.first { it.kind == SwipeKind.ARCHIVE }

        assertThat(archive.active).isTrue()
    }

    @Test
    fun `an imposed archive offers no archive nor unarchive action`() {
        val kinds = model(isArchived = true, canToggleArchive = false).trailing.map { it.kind }

        assertThat(kinds).containsExactly(SwipeKind.MARK_UNREAD, SwipeKind.REMOVE).inOrder()
    }

    @Test
    fun `an unread row offers mark read and a read one mark unread`() {
        assertThat(model(hasUnread = true).trailing.map { it.kind }).contains(SwipeKind.MARK_READ)
        assertThat(model(hasUnread = false).trailing.map { it.kind }).contains(SwipeKind.MARK_UNREAD)
    }

    @Test
    fun `a row the viewer cannot remove has no hide action`() {
        assertThat(model(removal = null).trailing.map { it.kind }).doesNotContain(SwipeKind.REMOVE)
    }

    @Test
    fun `a row the viewer may make obsolete reveals the obsolete action last, with no toggled state`() {
        val last = model(obsolete = true).trailing.last()

        assertThat(last).isEqualTo(ConversationSwipeItem(SwipeKind.OBSOLETE, active = false))
        assertThat(model(obsolete = true)).isNotEqualTo(model(obsolete = false))
    }

    @Test
    fun `the icon state takes part in equality so a toggle recomposes the row`() {
        assertThat(model(isPinned = true)).isNotEqualTo(model(isPinned = false))
        assertThat(model(isMuted = true)).isNotEqualTo(model(isMuted = false))
        assertThat(model(isLocked = true)).isNotEqualTo(model(isLocked = false))
        assertThat(model(isArchived = true)).isNotEqualTo(model(isArchived = false))
        assertThat(model(hasUnread = true)).isNotEqualTo(model(hasUnread = false))
        assertThat(model(isPinned = true)).isEqualTo(model(isPinned = true))
    }
}

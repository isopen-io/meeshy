package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationSwipeActionModelTest {

    private fun model(
        isPinned: Boolean = false,
        isArchived: Boolean = false,
        hasUnread: Boolean = false,
        canToggleArchive: Boolean = true,
        obsolete: Boolean = false,
    ) = ConversationSwipeActionModel.of(
        isPinned = isPinned,
        isArchived = isArchived,
        hasUnread = hasUnread,
        canToggleArchive = canToggleArchive,
        obsolete = obsolete,
    )

    private fun ConversationSwipeActionModel.leadingState() = leading.associate { it.kind to it.active }

    @Test
    fun `leading side carries the pinned state of the row`() {
        assertThat(model(isPinned = true).leadingState()).containsExactly(SwipeKind.PIN, true)
    }

    @Test
    fun `a plain row offers pin alone in its initial state, mute and lock living in the menu`() {
        assertThat(model().leadingState()).containsExactly(SwipeKind.PIN, false)
    }

    @Test
    fun `an archived row offers the archive action in its unarchive state`() {
        val archive = model(isArchived = true).trailing.first { it.kind == SwipeKind.ARCHIVE }

        assertThat(archive.active).isTrue()
    }

    @Test
    fun `an imposed archive offers no archive nor unarchive action`() {
        val kinds = model(isArchived = true, canToggleArchive = false).trailing.map { it.kind }

        assertThat(kinds).containsExactly(SwipeKind.MARK_UNREAD)
    }

    @Test
    fun `an unread row offers mark read and a read one mark unread`() {
        assertThat(model(hasUnread = true).trailing.map { it.kind }).contains(SwipeKind.MARK_READ)
        assertThat(model(hasUnread = false).trailing.map { it.kind }).contains(SwipeKind.MARK_UNREAD)
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
        assertThat(model(isArchived = true)).isNotEqualTo(model(isArchived = false))
        assertThat(model(hasUnread = true)).isNotEqualTo(model(hasUnread = false))
        assertThat(model(isPinned = true)).isEqualTo(model(isPinned = true))
    }
}

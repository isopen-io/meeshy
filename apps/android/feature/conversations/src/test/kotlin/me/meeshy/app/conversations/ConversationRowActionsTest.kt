package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationRowActionsTest {

    @Test
    fun `default actions can all be invoked without effect`() {
        val actions = ConversationRowActions()

        actions.onClick()
        actions.onTogglePin()
        actions.onToggleMute()
        actions.onToggleMentionsOnly()
        actions.onToggleArchive()
        actions.onLeaveConversation()
        actions.onDeleteForMe()
        actions.onDeleteForAll()
        actions.onRename("x")
        actions.onSetReaction(null)
        actions.onSetTags(listOf("a"))
        actions.onMarkRead()
        actions.onMarkUnread()
        actions.onDiscardDraft()
        actions.onAssignCategory("c")
        actions.onCreateCategory("c")
        actions.onLoadPreview()
        actions.onLockToggle()
    }

    @Test
    fun `copy overrides one action and leaves the original untouched`() {
        var pinned = 0
        val original = ConversationRowActions()
        val copy = original.copy(onTogglePin = { pinned++ })

        copy.onTogglePin()
        original.onTogglePin()

        assertThat(pinned).isEqualTo(1)
        assertThat(copy.onClick).isSameInstanceAs(original.onClick)
        assertThat(copy.onTogglePin).isNotSameInstanceAs(original.onTogglePin)
    }

    @Test
    fun `copy carrying the same callbacks is equal to the original`() {
        val original = ConversationRowActions()

        assertThat(original.copy()).isEqualTo(original)
    }
}

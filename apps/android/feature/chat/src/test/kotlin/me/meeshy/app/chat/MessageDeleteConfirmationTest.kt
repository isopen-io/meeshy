package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.PinAction
import org.junit.Test

class MessageDeleteConfirmationTest {

    private fun menu(isOutgoing: Boolean, canDeleteForEveryone: Boolean) = MessageActionMenu.actions(
        MessageActionContext(
            isDeleted = false,
            isPending = false,
            isFailed = false,
            isOutgoing = isOutgoing,
            isTranslated = false,
            isShowingOriginal = false,
            isStarred = false,
            canEdit = false,
            canDeleteForEveryone = canDeleteForEveryone,
            pinAction = PinAction.Unavailable,
        ),
    )

    @Test
    fun `my recent message offers both deletions, for everyone first, like iOS`() {
        val scopes = MessageDeleteConfirmation.scopes(menu(isOutgoing = true, canDeleteForEveryone = true))

        assertThat(scopes).containsExactly(MessageAction.DeleteForEveryone, MessageAction.DeleteForMe).inOrder()
    }

    @Test
    fun `a received message only offers to delete it for me`() {
        val scopes = MessageDeleteConfirmation.scopes(menu(isOutgoing = false, canDeleteForEveryone = false))

        assertThat(scopes).containsExactly(MessageAction.DeleteForMe)
    }

    @Test
    fun `a menu without any deletion asks nothing`() {
        assertThat(MessageDeleteConfirmation.scopes(listOf(MessageAction.Copy, MessageAction.Pin))).isEmpty()
    }
}

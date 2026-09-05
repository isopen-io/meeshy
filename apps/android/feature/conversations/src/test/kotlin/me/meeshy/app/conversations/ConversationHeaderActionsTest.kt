package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationHeaderActionsTest {

    @Test
    fun `neither lock affordance active - only the two iOS-parity actions show, in order`() {
        assertThat(conversationHeaderActions(canUnlockAll = false, hasMasterPin = false)).containsExactly(
            ConversationHeaderAction.CREATE_SHARE_LINK,
            ConversationHeaderAction.NEW_CONVERSATION,
        ).inOrder()
    }

    @Test
    fun `canUnlockAll only - unlock leads, then the two parity actions`() {
        assertThat(conversationHeaderActions(canUnlockAll = true, hasMasterPin = false)).containsExactly(
            ConversationHeaderAction.UNLOCK_ALL,
            ConversationHeaderAction.CREATE_SHARE_LINK,
            ConversationHeaderAction.NEW_CONVERSATION,
        ).inOrder()
    }

    @Test
    fun `hasMasterPin only - lock menu leads, then the two parity actions`() {
        assertThat(conversationHeaderActions(canUnlockAll = false, hasMasterPin = true)).containsExactly(
            ConversationHeaderAction.LOCK_SECURITY_MENU,
            ConversationHeaderAction.CREATE_SHARE_LINK,
            ConversationHeaderAction.NEW_CONVERSATION,
        ).inOrder()
    }

    @Test
    fun `both lock affordances active - both lead, then the two parity actions, never reordered`() {
        assertThat(conversationHeaderActions(canUnlockAll = true, hasMasterPin = true)).containsExactly(
            ConversationHeaderAction.UNLOCK_ALL,
            ConversationHeaderAction.LOCK_SECURITY_MENU,
            ConversationHeaderAction.CREATE_SHARE_LINK,
            ConversationHeaderAction.NEW_CONVERSATION,
        ).inOrder()
    }
}

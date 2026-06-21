package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

class ConversationSwipeActionsTest {

    private fun conversation(prefs: ApiConversationPreferences? = null) =
        ApiConversation(id = "c1", title = "Team", preferences = prefs)

    @Test
    fun `leading offers pin then mute mirroring iOS order`() {
        val actions = ConversationSwipeActions.leading(conversation())

        assertThat(actions.map { it.action })
            .containsExactly(ConversationSwipeAction.PIN, ConversationSwipeAction.MUTE)
            .inOrder()
    }

    @Test
    fun `trailing offers archive`() {
        val actions = ConversationSwipeActions.trailing(conversation())

        assertThat(actions.map { it.action }).containsExactly(ConversationSwipeAction.ARCHIVE)
    }

    @Test
    fun `active state reflects current preferences`() {
        val conv = conversation(
            ApiConversationPreferences(isPinned = true, isMuted = false, isArchived = true),
        )

        val all = ConversationSwipeActions.leading(conv) + ConversationSwipeActions.trailing(conv)

        assertThat(all.single { it.action == ConversationSwipeAction.PIN }.active).isTrue()
        assertThat(all.single { it.action == ConversationSwipeAction.MUTE }.active).isFalse()
        assertThat(all.single { it.action == ConversationSwipeAction.ARCHIVE }.active).isTrue()
    }

    @Test
    fun `null preferences read as all inactive`() {
        val all = ConversationSwipeActions.leading(conversation()) +
            ConversationSwipeActions.trailing(conversation())

        assertThat(all.none { it.active }).isTrue()
    }
}

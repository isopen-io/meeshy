package me.meeshy.sdk.model.conversationcard

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationCardJoinAccountTest {

    @Test
    fun `the button names the display name and speaks the handle`() {
        val account = ConversationCardJoinAccount.resolve(displayName = "  Moussa Traoré ", username = "moussa", isAnonymous = false)

        assertThat(account).isEqualTo(ConversationCardJoinAccount(title = "Moussa Traoré", handle = "@moussa"))
        assertThat(account?.spokenName).isEqualTo("@moussa")
    }

    @Test
    fun `without a display name the button names the handle`() {
        val account = ConversationCardJoinAccount.resolve(displayName = " ", username = "moussa", isAnonymous = false)

        assertThat(account?.title).isEqualTo("@moussa")
    }

    @Test
    fun `without a username the display name is also what is spoken`() {
        val account = ConversationCardJoinAccount.resolve(displayName = "Moussa", username = " ", isAnonymous = false)

        assertThat(account).isEqualTo(ConversationCardJoinAccount(title = "Moussa", handle = null))
        assertThat(account?.spokenName).isEqualTo("Moussa")
    }

    @Test
    fun `no name at all keeps the generic label`() {
        assertThat(ConversationCardJoinAccount.resolve(displayName = null, username = "", isAnonymous = false)).isNull()
    }

    @Test
    fun `a guest session has no account to engage`() {
        assertThat(ConversationCardJoinAccount.resolve(displayName = "Invité", username = "guest_1", isAnonymous = true)).isNull()
    }
}

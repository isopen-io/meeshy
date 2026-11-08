package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TypingNamesTest {

    private fun event(displayName: String? = null, username: String? = null) =
        TypingEvent(conversationId = "c1", userId = "u1", username = username, displayName = displayName)

    @Test
    fun `in the conversation the display name wins over the username`() {
        assertThat(TypingNames.inConversation(event("Alice B", "alice"))).isEqualTo("Alice B")
    }

    @Test
    fun `in the conversation a blank display name falls back to the username then the id`() {
        assertThat(TypingNames.inConversation(event("", "alice"))).isEqualTo("alice")
        assertThat(TypingNames.inConversation(event())).isEqualTo("u1")
    }

    @Test
    fun `on the pill the username is prefixed with an at sign`() {
        assertThat(TypingNames.onPill(event(null, "alice"))).isEqualTo("@alice")
        assertThat(TypingNames.onPill(event("Alice B", "alice"))).isEqualTo("Alice B")
        assertThat(TypingNames.onPill(event())).isEqualTo("u1")
    }
}

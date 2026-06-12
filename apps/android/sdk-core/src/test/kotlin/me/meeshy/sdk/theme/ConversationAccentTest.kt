package me.meeshy.sdk.theme

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import org.junit.Test

class ConversationAccentTest {

    @Test
    fun `accentHex is deterministic for the same conversation`() {
        val conversation = ApiConversation(id = "c1", title = "Team", type = "group")

        assertThat(conversation.accentHex()).isEqualTo(conversation.accentHex())
    }

    @Test
    fun `accentHex differs between conversation types`() {
        val direct = ApiConversation(id = "c1", title = "Team", type = "direct")
        val group = ApiConversation(id = "c2", title = "Team", type = "group")

        assertThat(direct.accentHex()).isNotEqualTo(group.accentHex())
    }

    @Test
    fun `displayTitle prefers the title then the custom name`() {
        val titled = ApiConversation(id = "c1", title = "Team")
        val custom = ApiConversation(
            id = "c2",
            title = " ",
            preferences = ApiConversationPreferences(customName = "Mon groupe"),
        )
        val bare = ApiConversation(id = "c3")

        assertThat(titled.displayTitle()).isEqualTo("Team")
        assertThat(custom.displayTitle()).isEqualTo("Mon groupe")
        assertThat(bare.displayTitle()).isEqualTo("Conversation")
    }
}

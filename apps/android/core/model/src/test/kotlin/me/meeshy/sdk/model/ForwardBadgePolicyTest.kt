package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ForwardBadgePolicyTest {

    private fun ref(name: String? = "Team Meeshy", type: String? = "group") =
        ForwardReference(conversationName = name, conversationType = type)

    @Test
    fun `a null reference has no source name`() {
        assertThat(ForwardBadgePolicy.conversationName(null)).isNull()
    }

    @Test
    fun `a reference without a conversation name has no source name`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = null))).isNull()
    }

    @Test
    fun `a blank conversation name is treated as absent`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = ""))).isNull()
    }

    @Test
    fun `a group conversation is named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Team Meeshy", type = "group")))
            .isEqualTo("Team Meeshy")
    }

    @Test
    fun `a public conversation is named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Lobby", type = "public")))
            .isEqualTo("Lobby")
    }

    @Test
    fun `a global conversation is named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "World", type = "global")))
            .isEqualTo("World")
    }

    @Test
    fun `a community conversation is named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Devs", type = "community")))
            .isEqualTo("Devs")
    }

    @Test
    fun `a channel conversation is named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Updates", type = "channel")))
            .isEqualTo("Updates")
    }

    @Test
    fun `a broadcast conversation is named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "News", type = "broadcast")))
            .isEqualTo("News")
    }

    @Test
    fun `a direct conversation is never named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Alice", type = "direct"))).isNull()
    }

    @Test
    fun `a bot conversation is never named`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "MeeshyBot", type = "bot"))).isNull()
    }

    @Test
    fun `an unknown conversation type keeps the status quo and shows the name`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Legacy", type = "mystery")))
            .isEqualTo("Legacy")
    }

    @Test
    fun `a missing conversation type shows the name`() {
        assertThat(ForwardBadgePolicy.conversationName(ref(name = "Legacy", type = null)))
            .isEqualTo("Legacy")
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import me.meeshy.sdk.model.deeplink.DeepLinkParser
import org.junit.Test

class AssistantDeepLinkTest {
    private fun parse(raw: String?) = DeepLinkParser.parse(raw!!, "https://meeshy.me")

    @Test
    fun `recent and unread read back as the list entries`() {
        assertThat(parse(AssistantDeepLink.recentConversation())).isEqualTo(D.RecentConversation)
        assertThat(parse(AssistantDeepLink.unreadConversations())).isEqualTo(D.UnreadConversations)
    }

    @Test
    fun `send carries the whole dictated draft`() {
        val link = AssistantDeepLink.send("c1", "Tom & Jerry ce soir = 5+5 ? #fun 😀")
        assertThat(parse(link)).isEqualTo(D.Conversation("c1", "Tom & Jerry ce soir = 5+5 ? #fun 😀"))
    }

    @Test
    fun `send without a message opens the direct conversation alone`() {
        assertThat(parse(AssistantDeepLink.send("c1", "  "))).isEqualTo(D.Conversation("c1"))
        assertThat(parse(AssistantDeepLink.send("c1"))).isEqualTo(D.Conversation("c1"))
    }

    @Test
    fun `call defaults to audio and video when asked`() {
        assertThat(parse(AssistantDeepLink.call("c1"))).isEqualTo(D.Call("c1", isVideo = false))
        assertThat(parse(AssistantDeepLink.call("c1", isVideo = true))).isEqualTo(D.Call("c1", isVideo = true))
    }

    @Test
    fun `an empty or unreadable id yields no link`() {
        assertThat(AssistantDeepLink.send("", "hi")).isNull()
        assertThat(AssistantDeepLink.send("   ", "hi")).isNull()
        assertThat(AssistantDeepLink.send("a b", "hi")).isNull()
        assertThat(AssistantDeepLink.call("")).isNull()
        assertThat(AssistantDeepLink.call("a\nb", true)).isNull()
    }
}

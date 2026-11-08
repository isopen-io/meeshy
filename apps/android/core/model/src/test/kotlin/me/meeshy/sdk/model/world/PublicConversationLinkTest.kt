package me.meeshy.sdk.model.world

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PublicConversationLinkTest {

    private val world = WorldEntry(identifier = "mshy_world", title = "World Wide", shareLinkIdentifier = "mshy_world")
    private val origin = "https://meeshy.me"

    @Test
    fun `a guest shares the link they entered by`() {
        assertThat(PublicConversationLink.url(conversationType = null, conversationIdentifier = null, guestLinkId = "mshy_abc", world = null, webOrigin = origin))
            .isEqualTo("https://meeshy.me/chat/mshy_abc")
    }

    @Test
    fun `the world conversation is recognised by the served identifier`() {
        assertThat(PublicConversationLink.url("global", "mshy_world", null, world, origin)).isEqualTo("https://meeshy.me/chat/mshy_world")
    }

    @Test
    fun `a global conversation with another identifier has no link`() {
        assertThat(PublicConversationLink.url("global", "other", null, world, origin)).isNull()
    }

    @Test
    fun `an ordinary conversation has no public link`() {
        assertThat(PublicConversationLink.url("group", "mshy_world", null, world, origin)).isNull()
    }

    @Test
    fun `the link key is percent-encoded and a slash never survives`() {
        assertThat(PublicConversationLink.url(null, null, "a b/c", null, "https://meeshy.me/")).isEqualTo("https://meeshy.me/chat/a%20b%2Fc")
    }

    @Test
    fun `only a global conversation without a guest link needs the world entry`() {
        assertThat(PublicConversationLink.needsWorldEntry("global", null)).isTrue()
        assertThat(PublicConversationLink.needsWorldEntry("global", "")).isTrue()
        assertThat(PublicConversationLink.needsWorldEntry("global", "k")).isFalse()
        assertThat(PublicConversationLink.needsWorldEntry("group", null)).isFalse()
        assertThat(PublicConversationLink.needsWorldEntry(null, null)).isFalse()
    }
}

package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationLinkTargetTest {

    private fun target(raw: String) = ConversationLinkTarget.target(raw, "https://meeshy.me")

    @Test
    fun `chat and join links are share links`() {
        assertThat(target("https://meeshy.me/chat/mshy_club")).isEqualTo(ConversationCardTarget.ShareLink("mshy_club"))
        assertThat(target("https://meeshy.me/join/abc123")).isEqualTo(ConversationCardTarget.ShareLink("abc123"))
        assertThat(target("meeshy://join/abc123")).isEqualTo(ConversationCardTarget.ShareLink("abc123"))
        assertThat(target("https://www.meeshy.me/chat/abc")).isEqualTo(ConversationCardTarget.ShareLink("abc"))
    }

    @Test
    fun `c and conversation routes are direct`() {
        assertThat(target("https://meeshy.me/c/64f1a2b3c4d5e6f708192a3b")).isEqualTo(ConversationCardTarget.Direct("64f1a2b3c4d5e6f708192a3b"))
        assertThat(target("https://meeshy.me/conversation/c1")).isEqualTo(ConversationCardTarget.Direct("c1"))
        assertThat(target("meeshy://c/c1")).isEqualTo(ConversationCardTarget.Direct("c1"))
        assertThat(target("  https://meeshy.me/c/c1 \n")).isEqualTo(ConversationCardTarget.Direct("c1"))
    }

    @Test
    fun `a tracked link is never a conversation`() {
        assertThat(target("https://meeshy.me/l/Ab3xYz")).isNull()
    }

    @Test
    fun `device shortcuts are not cards`() {
        assertThat(target("meeshy://contact/c1")).isNull()
        assertThat(target("meeshy://quickreply/c1?text=salut")).isNull()
        assertThat(target("meeshy://send?contactId=c1&message=salut")).isNull()
    }

    @Test
    fun `other meeshy routes are not conversations`() {
        assertThat(target("https://meeshy.me/post/p1")).isNull()
        assertThat(target("https://meeshy.me/u/priya")).isNull()
    }

    @Test
    fun `foreign hosts and schemes are rejected`() {
        assertThat(target("https://evil.example/chat/abc")).isNull()
        assertThat(target("https://meeshy.me.evil.example/c/c1")).isNull()
        assertThat(target("https://example.com/join/abc")).isNull()
        assertThat(target("ftp://meeshy.me/c/c1")).isNull()
    }

    @Test
    fun `an empty identifier and malformed input are rejected`() {
        assertThat(target("https://meeshy.me/chat/")).isNull()
        assertThat(target("https://meeshy.me/c/%20")).isNull()
        assertThat(target("")).isNull()
        assertThat(target("pas un lien")).isNull()
    }
}

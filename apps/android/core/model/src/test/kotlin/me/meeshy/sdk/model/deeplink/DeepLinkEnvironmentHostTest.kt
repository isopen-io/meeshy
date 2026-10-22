package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import org.junit.Test

class DeepLinkEnvironmentHostTest {

    private val staging = "https://staging.meeshy.me"
    private val production = "https://meeshy.me"

    @Test
    fun `staging links on staging are meeshy links`() {
        assertThat(DeepLinkParser.parse("https://staging.meeshy.me/join/mshy_club", staging)).isEqualTo(D.JoinLink("mshy_club"))
        assertThat(DeepLinkParser.parse("https://staging.meeshy.me/c/abc123", staging)).isEqualTo(D.Conversation("abc123"))
        assertThat(DeepLinkParser.parse("https://www.staging.meeshy.me/c/abc123", staging)).isEqualTo(D.Conversation("abc123"))
    }

    @Test
    fun `staging links on production stay external`() {
        val link = "https://staging.meeshy.me/join/mshy_club"
        assertThat(DeepLinkParser.parse(link, production)).isEqualTo(D.External(link))
    }

    @Test
    fun `production links on staging are still meeshy links`() {
        assertThat(DeepLinkParser.parse("https://meeshy.me/join/mshy_club", staging)).isEqualTo(D.JoinLink("mshy_club"))
    }

    @Test
    fun `foreign hosts on staging stay external`() {
        listOf(
            "https://evil.example/join/mshy_club",
            "https://staging.meeshy.me.evil.example/join/mshy_club",
            "https://evilstaging.meeshy.me/join/mshy_club",
            "https://gate.staging.meeshy.me/join/mshy_club",
        ).forEach { assertThat(DeepLinkParser.parse(it, staging)).isEqualTo(D.External(it)) }
    }

    @Test
    fun `an unreadable environment origin falls back to the production hosts only`() {
        assertThat(DeepLinkParser.isMeeshyHost("app.meeshy.me", "")).isTrue()
        assertThat(DeepLinkParser.isMeeshyHost("staging.meeshy.me", "garbage")).isFalse()
    }

    @Test
    fun `hosts compare case-insensitively`() {
        assertThat(DeepLinkParser.parse("https://MEESHY.me/c/x", production)).isEqualTo(D.Conversation("x"))
    }

    @Test
    fun `staging cards come from the injected origin`() {
        assertThat(ConversationLinkTarget.target("https://staging.meeshy.me/join/mshy_club", staging))
            .isEqualTo(ConversationCardTarget.ShareLink("mshy_club"))
        assertThat(ConversationLinkTarget.target("https://staging.meeshy.me/c/abc123", staging))
            .isEqualTo(ConversationCardTarget.Direct("abc123"))
        assertThat(ConversationLinkTarget.target("https://staging.meeshy.me/c/abc123", production)).isNull()
    }
}

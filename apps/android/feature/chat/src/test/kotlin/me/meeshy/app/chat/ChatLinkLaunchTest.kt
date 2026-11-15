package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/**
 * What a tapped chat link becomes (#10874, #8075): an e-mail token link and a referral invitation open in a browser
 * and only a browser — never handed back to the app as an App Link, never through `meeshy://`; every other link
 * keeps the [me.meeshy.sdk.link.LinkOpenPolicy] verdict. Mirrors the iOS `InAppLinks` policy.
 */
class ChatLinkLaunchTest {

    private fun assertBrowserOnly(url: String, expected: String = url) =
        assertWithMessage(url).that(chatLinkLaunchFor(url)).isEqualTo(ChatLinkLaunch.BrowserOnly(expected))

    private fun assertIgnored(url: String) =
        assertWithMessage(url).that(chatLinkLaunchFor(url)).isEqualTo(ChatLinkLaunch.Ignored)

    private fun assertInAppBrowser(url: String, expected: String = url) =
        assertWithMessage(url).that(chatLinkLaunchFor(url)).isEqualTo(ChatLinkLaunch.InAppBrowser(expected))

    @Test
    fun `an ordinary web link opens in the in-app browser`() {
        assertInAppBrowser("https://example.com/blog")
        assertInAppBrowser("http://example.com")
        assertInAppBrowser("example.com", expected = "https://example.com")
        assertInAppBrowser("  https://meeshy.me/blog  ", expected = "https://meeshy.me/blog")
    }

    @Test
    fun `an ordinary Meeshy link keeps the in-app browser, conversation invitations included`() {
        assertInAppBrowser("https://meeshy.me/u/alice")
        assertInAppBrowser("https://meeshy.me/c/conv1")
        assertInAppBrowser("https://meeshy.me/join/abc")
        assertInAppBrowser("https://meeshy.me/chat/abc")
        assertInAppBrowser("https://meeshy.me/story/xyz")
    }

    @Test
    fun `an e-mail token link opens in the browser only`() {
        listOf(
            "https://meeshy.me/auth/magic-link?via=email#token=abc",
            "https://meeshy.me/auth/magic-link/abc",
            "https://meeshy.me/auth/email-link/magic-link#token=abc",
            "https://meeshy.me/auth/verify-email?via=email#token=t&email=a%40b.co",
            "https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co",
            "https://meeshy.me/reset-password#token=r",
            "https://meeshy.me/auth/reset-password#token=r",
            "https://meeshy.me/auth/revoke-sessions?token=abc",
            "https://meeshy.me/account/deletion?token=abc",
            "https://meeshy.me/settings/verify-email-change?token=abc",
        ).forEach { assertBrowserOnly(it) }
    }

    @Test
    fun `a disguised e-mail token link opens in the browser only`() {
        listOf(
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me//auth///magic-link?token=abc",
            "https://meeshy.me/x/../auth/magic-link?token=abc",
            "https://meeshy.me/auth%2Fmagic-link?token=abc",
            "https://meeshy.me/%61uth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/magic%E2%80%8B-link?token=abc",
            "https://meeshy.me/auth/magic-link;x=1?token=abc",
            "https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.co",
            "https://evil.example\\@meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me/#/auth/magic-link?token=abc",
        ).forEach { assertBrowserOnly(it) }
    }

    @Test
    fun `a bare e-mail token address is promoted to https and opens in the browser only`() {
        assertBrowserOnly("meeshy.me/auth/magic-link?token=abc", expected = "https://meeshy.me/auth/magic-link?token=abc")
    }

    @Test
    fun `an e-mail token link that cannot open over https opens nowhere`() {
        assertIgnored("http://meeshy.me/auth/magic-link?token=abc")
        assertIgnored("http://example.com/reset-password")
    }

    @Test
    fun `an e-mail token link under the custom scheme is never handed to the OS`() {
        listOf(
            "meeshy://auth/magic-link?token=abc",
            "meeshy://auth/magic-link#token=abc",
            "meeshy://auth/verify-email#token=t&email=a%40b.co",
            "meeshy://auth/reset-password#token=r",
            "meeshy://reset-password#token=r",
            "MEESHY://auth/magic-link?token=abc",
        ).forEach(::assertIgnored)
    }

    @Test
    fun `a referral invitation opens in the browser only`() {
        assertBrowserOnly("https://meeshy.me/signup/affiliate/aff_abc123")
        assertBrowserOnly("https://www.meeshy.me/signup?ref=ref_abc")
        assertBrowserOnly("https://meeshy.me/signup?parrain=ref_abc")
        assertBrowserOnly("https://meeshy.me/signup?affiliate=aff_abc")
    }

    @Test
    fun `a non-web scheme still goes to the OS and a dangerous one is ignored`() {
        assertThat(chatLinkLaunchFor("mailto:hi@meeshy.me")).isEqualTo(ChatLinkLaunch.External("mailto:hi@meeshy.me"))
        assertThat(chatLinkLaunchFor("tel:+33123456789")).isEqualTo(ChatLinkLaunch.External("tel:+33123456789"))
        assertThat(chatLinkLaunchFor("meeshy://chat/abc")).isEqualTo(ChatLinkLaunch.External("meeshy://chat/abc"))
        assertIgnored("javascript:alert(1)")
        assertIgnored("data:text/html,<h1>x</h1>")
        assertIgnored("file:///etc/passwd")
        assertIgnored("")
        assertIgnored("   ")
        assertIgnored("http://")
    }
}

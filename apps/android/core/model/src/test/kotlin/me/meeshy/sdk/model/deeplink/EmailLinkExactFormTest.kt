package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.DeepLinkDestination as D
import org.junit.Test

class EmailLinkExactFormTest {

    private fun parse(raw: String) = DeepLinkParser.parse(raw, "https://meeshy.me")

    private fun isSignIn(d: D) = d is D.MagicLink || d is D.EmailVerificationLink || d is D.PasswordResetLink

    @Test
    fun `exact forms still route`() {
        assertThat(parse("https://meeshy.me/auth/magic-link?token=abcdef123456")).isEqualTo(D.MagicLink("abcdef123456"))
        assertThat(parse("https://meeshy.me/auth/magic-link?via=email#token=abc")).isEqualTo(D.MagicLink("abc"))
        assertThat(parse("https://meeshy.me/auth/magic-link/tok-3_A")).isEqualTo(D.MagicLink("tok-3_A"))
        assertThat(parse("https://www.meeshy.me/auth/email-link/magic-link#token=abc")).isEqualTo(D.MagicLink("abc"))
        assertThat(parse("https://meeshy.me/auth/verify-email#token=t&email=a%40b.co")).isEqualTo(D.EmailVerificationLink("t", "a@b.co"))
        assertThat(parse("https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co")).isEqualTo(D.EmailVerificationLink("t", "a@b.co"))
        assertThat(parse("https://meeshy.me/reset-password#token=r")).isEqualTo(D.PasswordResetLink("r"))
        assertThat(parse("https://meeshy.me/auth/reset-password#token=r")).isEqualTo(D.PasswordResetLink("r"))
        assertThat(parse("https://meeshy.me/auth/email-link/reset-password#token=r")).isEqualTo(D.PasswordResetLink("r"))
    }

    @Test
    fun `a link without its token or email opens nothing`() {
        assertThat(parse("https://meeshy.me/auth/magic-link")).isInstanceOf(D.External::class.java)
        assertThat(parse("https://meeshy.me/auth/magic-link?token=")).isInstanceOf(D.External::class.java)
        assertThat(parse("https://meeshy.me/auth/verify-email#token=t")).isInstanceOf(D.External::class.java)
        assertThat(parse("https://meeshy.me/reset-password")).isInstanceOf(D.External::class.java)
    }

    @Test
    fun `variants are refused and left to the browser`() {
        listOf(
            "https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.co",
            "https://meeshy.me/auth/email-link/verify-email/x#token=abc&email=a%40b.co",
            "https://meeshy.me/auth/verify-email%20?token=abc&email=a%40b.co",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/magic-link%09?token=abc",
            "https://meeshy.me/auth/magic-link%C2%A0?token=abc",
            "https://meeshy.me/auth/%E3%80%80magic-link?token=abc",
            "https://meeshy.me/auth/magic%E2%80%8B-link?token=abc",
            "https://meeshy.me/auth/magic-link%20/abc",
            "https://meeshy.me/auth/magic-link/abc%20",
            "https://meeshy.me/auth/magic-link/abc/extra",
            "https://meeshy.me/auth/magic-link/validate?token=abc",
            "https://meeshy.me/auth/magic-link/?token=abc",
            "https://meeshy.me//auth/magic-link?token=abc",
            "https://meeshy.me/auth//magic-link?token=abc",
            "https://meeshy.me/x/../auth/magic-link?token=abc",
            "https://meeshy.me/./auth/magic-link?token=abc",
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me/auth%2Fmagic-link?token=abc",
            "https://meeshy.me/%61uth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-link;x=1?token=abc",
            "https://meeshy.me/auth;x/magic-link?token=abc",
            "https://meeshy.me/reset-password/x#token=abc",
            "https://meeshy.me/auth/reset-password/x#token=abc",
            "https://evil.example%5C@meeshy.me/auth/magic-link?token=abc",
            "https://user:pass@meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me:8443/auth/magic-link?token=abc",
            "http://meeshy.me/auth/magic-link?token=abc",
        ).forEach { raw ->
            assertThat(isSignIn(parse(raw))).isFalse()
            assertThat(DeepLinkParser.isMeeshyDeepLink(raw, "https://meeshy.me")).isFalse()
        }
    }

    @Test
    fun `the path rule mirrors the shared rule`() {
        listOf(
            "/auth/magic-link", "/auth/magic-link/validate", "/auth/verify-email", "/auth/revoke-sessions",
            "/reset-password", "/account/deletion", "/settings/verify-email-change",
            "/auth/email-link/magic-link", "/auth/email-link/whatever", "/auth/reset-password",
            "/AUTH/Magic-Link", "//auth///magic-link", "/auth/magic-link/", "/auth%2Fmagic-link",
            "/%61uth/magic-link", "/x/../auth/magic-link", "/auth\\magic-link", "/auth/magic-link%20",
            "/auth/magic-link%C2%A0", "/auth/%E3%80%80magic-link", "/auth/%C2%85magic-link",
            "/auth/verify-email/x", "/auth/magic-link;x=1", "/auth;x/magic-link", "/auth%252Fmagic-link",
            "/auth/magic%E2%80%8B-link", "/auth/magic-link%3Ftoken=abc",
        ).forEach { assertThat(EmailLinkSecret.carriesSecret(it)).isTrue() }
        listOf("/", "/chat/abc", "/auth/login", "/auth/magic-linker", "/blog/reset-password-tips")
            .forEach { assertThat(EmailLinkSecret.carriesSecret(it)).isFalse() }
    }
}

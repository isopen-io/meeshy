package me.meeshy.sdk.model.link

import com.google.common.truth.Truth.assertWithMessage
import org.junit.Test

/**
 * La politique d'un lien Meeshy TOUCHÉ dans l'app (message, post, commentaire) — miroir de `InAppLinks.swift`
 * (#7808, #8075, #10874). Un lien à jeton d'e-mail et une invitation de parrainage partent au navigateur : le premier
 * connecterait le lecteur au compte de celui qui l'a posté, le second n'a rien à ouvrir dans l'app d'un compte
 * connecté.
 */
class InAppLinksTest {

    private fun assertEmailLink(url: String) =
        assertWithMessage(url).that(InAppLinks.isEmailLink(url)).isTrue()

    private fun assertNotEmailLink(url: String) =
        assertWithMessage(url).that(InAppLinks.isEmailLink(url)).isFalse()

    private fun assertReferral(url: String) =
        assertWithMessage(url).that(InAppLinks.isReferralLink(url)).isTrue()

    private fun assertNotReferral(url: String) =
        assertWithMessage(url).that(InAppLinks.isReferralLink(url)).isFalse()

    @Test
    fun `un lien a jeton touche dans l'app est un lien d'e-mail`() {
        listOf(
            "https://meeshy.me/auth/magic-link?via=email#token=abc",
            "https://meeshy.me/auth/magic-link/abc",
            "https://meeshy.me/auth/email-link/magic-link#token=abc",
            "https://meeshy.me/auth/verify-email?via=email#token=t&email=a%40b.co",
            "https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co",
            "https://meeshy.me/reset-password#token=r",
            "https://meeshy.me/auth/revoke-sessions?token=abc",
            "https://meeshy.me/account/deletion?token=abc",
            "https://meeshy.me/settings/verify-email-change?token=abc",
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.co",
            "meeshy://auth/magic-link?token=abc",
        ).forEach(::assertEmailLink)
    }

    @Test
    fun `un lien ordinaire de Meeshy n'est pas un lien d'e-mail`() {
        listOf(
            "https://meeshy.me/c/conv1",
            "https://meeshy.me/u/alice",
            "https://meeshy.me/join/abc",
            "https://meeshy.me/chat/abc",
            "https://meeshy.me/story/xyz",
            "https://meeshy.me/signup/affiliate/aff_abc",
            "https://example.com/blog",
            "meeshy://chat/abc",
        ).forEach(::assertNotEmailLink)
    }

    @Test
    fun `un lien de parrainage touche dans l'app est une invitation`() {
        listOf(
            "https://meeshy.me/signup/affiliate/aff_abc123",
            "https://meeshy.me/signup/affiliate/ref_ABC-9",
            "https://www.meeshy.me/signup/affiliate/aff_abc123",
            "https://app.meeshy.me/signup/affiliate/aff_abc123",
            "https://MEESHY.ME/signup/affiliate/aff_abc123",
            "http://meeshy.me/signup/affiliate/aff_abc123",
            "https://meeshy.me//signup//affiliate//aff_abc123",
            "https://meeshy.me/%73ignup/affiliate/aff_abc123",
            "https://meeshy.me/signup?ref=ref_abc",
            "https://meeshy.me/signup?parrain=ref_abc",
            "https://meeshy.me/signup?affiliate=aff_abc",
            "https://meeshy.me/signup/?ref=ref_abc",
            "https://meeshy.me/signup?utm=x&ref=ref_abc#top",
        ).forEach(::assertReferral)
    }

    @Test
    fun `la premiere cle d'invitation renseignee decide`() {
        assertReferral("https://meeshy.me/signup?ref=&parrain=ref_abc")
        assertNotReferral("https://meeshy.me/signup?ref=a%20b&parrain=ref_abc")
    }

    @Test
    fun `ce qui n'a pas la forme d'une invitation n'en est pas une`() {
        listOf(
            "https://meeshy.me/signup",
            "https://meeshy.me/signup?ref=",
            "https://meeshy.me/signup?ref=%20%20",
            "https://meeshy.me/signup?ref=a%20b",
            "https://meeshy.me/signup?other=ref_abc",
            "https://meeshy.me/signup/affiliate",
            "https://meeshy.me/signup/affiliate/",
            "https://meeshy.me/signup/affiliate/aff_abc/extra",
            "https://meeshy.me/signup/other/aff_abc",
            "https://meeshy.me/signup/aff_abc",
            "https://meeshy.me/Signup/affiliate/aff_abc",
            "https://meeshy.me/login?ref=ref_abc",
            "https://meeshy.me/signup/affiliate/" + "a".repeat(129),
            "https://meeshy.me/join/abc",
            "https://meeshy.me/chat/abc",
            "https://meeshy.me/u/alice",
        ).forEach(::assertNotReferral)
    }

    @Test
    fun `un hote etranger ou deguise n'est pas Meeshy`() {
        listOf(
            "https://example.com/signup/affiliate/aff_abc",
            "https://meeshy.me.evil.example/signup/affiliate/aff_abc",
            "https://evilmeeshy.me/signup/affiliate/aff_abc",
            "https://evil.example/?u=meeshy.me/signup/affiliate/aff_abc",
            "https://meeshy.me\\.evil.example/signup/affiliate/aff_abc",
        ).forEach(::assertNotReferral)
    }

    @Test
    fun `un code de la longueur maximale est une invitation`() {
        assertReferral("https://meeshy.me/signup/affiliate/" + "a".repeat(128))
    }

    @Test
    fun `une adresse illisible ou un autre schema n'est pas une invitation`() {
        listOf("", "not a url", "meeshy.me/signup/affiliate/aff_abc", "mailto:hi@meeshy.me", "javascript:alert(1)")
            .forEach(::assertNotReferral)
    }
}

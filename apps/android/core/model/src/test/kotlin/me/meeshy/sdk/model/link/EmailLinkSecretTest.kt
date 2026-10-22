package me.meeshy.sdk.model.link

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.link.EmailLinkSecret.Form
import org.junit.Test

/**
 * UN LIEN À JETON D'E-MAIL N'ENTRE QUE PAR L'E-MAIL QUI LE PORTE (#10870, #10871, #10874, #10875).
 *
 * Les vecteurs sont REJOUÉS cas pour cas depuis `packages/shared/utils/email-link-secret.test.ts` (TypeScript,
 * qui fait foi) et `apps/ios/MeeshyTests/Unit/Navigation/EmailLinkExactFormTests.swift` : les trois miroirs de la
 * loi (shared, MeeshySDK, apps/android/core/model) rendent le même verdict sur les mêmes entrées.
 */
class EmailLinkSecretTest {

    private val canonicalPaths = listOf(
        "/auth/verify-email",
        "/auth/magic-link",
        "/auth/magic-link/validate",
        "/auth/revoke-sessions",
        "/reset-password",
        "/account/deletion",
        "/settings/verify-email-change",
    )

    private val aliasPaths = listOf(
        "/auth/email-link/magic-link",
        "/auth/email-link/verify-email",
        "/auth/email-link/reset-password",
    )

    private fun assertPathCarries(path: String) =
        assertWithMessage(path).that(EmailLinkSecret.pathCarriesSecret(path)).isTrue()

    private fun assertPathIsOrdinary(path: String) =
        assertWithMessage(path).that(EmailLinkSecret.pathCarriesSecret(path)).isFalse()

    private fun assertUrlCarries(url: String) =
        assertWithMessage(url).that(EmailLinkSecret.carriesSecret(url)).isTrue()

    private fun assertUrlIsOrdinary(url: String) =
        assertWithMessage(url).that(EmailLinkSecret.carriesSecret(url)).isFalse()

    private fun assertNoExactForm(url: String) =
        assertWithMessage(url).that(EmailLinkSecret.exactForm(url)).isNull()

    // ---------------------------------------------------------------- lecture LARGE : le chemin

    @Test
    fun `chaque chemin canonique et chaque alias porte un secret`() {
        (canonicalPaths + aliasPaths).forEach(::assertPathCarries)
    }

    @Test
    fun `un chemin voisin ne porte aucun secret`() {
        listOf("/", "/chat/abc", "/auth/login", "/auth/magic-linker", "/blog/reset-password-tips", "/auth", "/auth/email")
            .forEach(::assertPathIsOrdinary)
    }

    @Test
    fun `tout ce qui est sous une adresse a jeton porte le secret`() {
        listOf(
            "/auth/verify-email/x",
            "/reset-password/x",
            "/auth/revoke-sessions/x",
            "/auth/reset-password",
            "/auth/reset-password/x",
            "/auth/email-link/whatever",
            "/auth/email-link/magic-link/x",
            "/account/deletion/confirm",
            "/settings/verify-email-change/abc",
        ).forEach(::assertPathCarries)
    }

    @Test
    fun `la casse ne change pas le verdict`() {
        listOf("/AUTH/Magic-Link", "/Auth/Verify-Email", "/RESET-PASSWORD").forEach(::assertPathCarries)
    }

    @Test
    fun `les barres doublees, finales et le backslash ne changent pas le verdict`() {
        listOf(
            "//auth///magic-link",
            "/auth/magic-link/",
            "/auth/magic-link//",
            "/auth\\magic-link",
            "\\auth\\magic-link",
            "/auth\\\\magic-link",
        ).forEach(::assertPathCarries)
    }

    @Test
    fun `l'encodage simple, multiple et partiel ne change pas le verdict`() {
        listOf(
            "/auth%2Fmagic-link",
            "/%61uth/magic-link",
            "/auth%252Fmagic-link",
            "/auth%25252Fmagic-link",
            "/auth%2525252Fmagic-link",
            "/auth%2Fmagic-link/%ZZ",
            "/auth/magic-link%3Ftoken=abc",
            "/auth/magic-link%23token=abc",
        ).forEach(::assertPathCarries)
    }

    @Test
    fun `un empilement d'encodages demesure se termine sans rien lever`() {
        val tower = "/auth" + "%25".repeat(50) + "2Fmagic-link"
        assertThat(EmailLinkSecret.pathCarriesSecret(tower)).isFalse()
    }

    @Test
    fun `une suite pourcent invalide reste telle quelle comme decodeURIComponent sous try`() {
        assertPathIsOrdinary("/auth%C0%AFmagic-link")
        assertPathIsOrdinary("/auth%E0%80%AFmagic-link")
        assertPathIsOrdinary("/auth%ZZmagic-link")
    }

    @Test
    fun `les caracteres invisibles n'echappent pas a la lecture`() {
        listOf(
            "/auth/magic%E2%80%8B-link",
            "/auth/magic​-link",
            "/auth/­magic-link",
            "/auth/magic-link﻿",
            "/auth/mag͏ic-link",
            "/au؜th/magic-link",
            "/auth/magic⁠-link",
            "/auth/magic᠎-link",
            "/auth/magic️-link",
            "/auth/magicㅤ-link",
            "/auth/magicﾠ-link",
        ).forEach(::assertPathCarries)
    }

    @Test
    fun `les espaces autour d'un segment sont retires avant de comparer`() {
        listOf(
            "/auth/magic-link%20",
            "/auth/magic-link%09",
            "/auth/magic-link%C2%A0",
            "/auth/%E3%80%80magic-link",
            "/auth/%C2%85magic-link",
            "/auth/verify-email%20",
            "/ auth/magic-link",
            "/auth/magic-link /abc",
        ).forEach(::assertPathCarries)
    }

    @Test
    fun `un espace au milieu d'un segment le rend ordinaire`() {
        assertPathIsOrdinary("/auth/magic link")
        assertPathIsOrdinary("/auth/magic%20link")
    }

    @Test
    fun `les parametres point-virgule ne masquent pas le segment`() {
        listOf("/auth/magic-link;x=1", "/auth;x/magic-link", "/auth/magic-link;").forEach(::assertPathCarries)
    }

    @Test
    fun `les segments point et point-point sont resolus`() {
        listOf(
            "/x/../auth/magic-link",
            "/./auth/magic-link",
            "/auth/./magic-link",
            "/../auth/magic-link",
            "/a/b/../../auth/magic-link",
            "/auth/x/../magic-link",
        ).forEach(::assertPathCarries)
        assertPathIsOrdinary("/auth/magic-link/..")
        assertPathIsOrdinary("/auth/magic-link/../login")
    }

    // ---------------------------------------------------------------- lecture LARGE : l'adresse

    @Test
    fun `l'adresse d'un lien a jeton porte le secret, quelle que soit la forme du chemin`() {
        listOf(
            "https://meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-link/validate?token=abc",
            "https://meeshy.me/auth/verify-email?token=abc&email=a@b.c",
            "https://meeshy.me/reset-password?via=email#token=abc",
            "https://meeshy.me/auth/reset-password?token=abc",
            "https://meeshy.me/auth/revoke-sessions?token=abc",
            "https://meeshy.me/account/deletion?token=abc",
            "https://meeshy.me/settings/verify-email-change?token=abc",
            "https://meeshy.me/auth/email-link/magic-link#token=abc",
            "https://meeshy.me/auth/email-link/verify-email#token=abc",
            "https://meeshy.me/auth/email-link/reset-password#token=abc",
            "https://meeshy.me/auth/email-link/whatever#token=abc",
            "https://meeshy.me/AUTH/Magic-Link?token=abc",
            "https://meeshy.me//auth///magic-link?token=abc",
            "https://meeshy.me/auth/magic-link/?token=abc",
            "https://meeshy.me/auth%2Fmagic-link?token=abc",
            "https://meeshy.me/%61uth/magic-link?token=abc",
            "https://meeshy.me/x/../auth/magic-link?token=abc",
            "https://evil.example/auth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-link%20?token=abc",
            "https://meeshy.me/auth/magic-link%09?token=abc",
            "https://meeshy.me/auth/magic-link%C2%A0?token=abc",
            "https://meeshy.me/auth/%E3%80%80magic-link?token=abc",
            "https://meeshy.me/auth/%C2%85magic-link?token=abc",
            "https://meeshy.me/auth/verify-email%20?token=abc&email=a@b.c",
            "https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.c",
            "https://meeshy.me/reset-password/x?token=abc",
            "https://meeshy.me/auth/revoke-sessions/x?token=abc",
            "https://meeshy.me/auth/magic-link;x=1?token=abc",
            "https://meeshy.me/auth;x/magic-link?token=abc",
            "https://meeshy.me/auth%2Fmagic-link/%ZZ?token=abc",
            "https://meeshy.me/auth%252Fmagic-link?token=abc",
            "https://meeshy.me/auth/magic%E2%80%8B-link?token=abc",
            "https://meeshy.me/auth/magic-link%3Ftoken=abc",
        ).forEach(::assertUrlCarries)
    }

    @Test
    fun `les deux lectures de l'autorite voient le secret`() {
        listOf(
            "https://meeshy.me\\auth\\magic-link?token=abc",
            "https://evil.example\\@meeshy.me/auth/magic-link?token=abc",
            "https://evil.example%5C@meeshy.me/auth/magic-link?token=abc",
            "https:meeshy.me/auth/magic-link?token=abc",
            "https:\\\\meeshy.me\\auth\\magic-link?token=abc",
            "https:////meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me/auth/magic-li\tnk?token=abc",
            "https://meeshy.me/auth/magic-li\nnk?token=abc",
            "  https://meeshy.me/auth/magic-link?token=abc  ",
            "HTTPS://MEESHY.ME/AUTH/MAGIC-LINK?token=abc",
        ).forEach(::assertUrlCarries)
    }

    @Test
    fun `une route dans le fragment est lue comme un chemin`() {
        listOf(
            "https://meeshy.me/#/auth/magic-link?token=abc",
            "https://meeshy.me/?x=1#/reset-password?token=abc",
            "https://meeshy.me/#/auth/email-link/verify-email",
        ).forEach(::assertUrlCarries)
    }

    @Test
    fun `sous meeshy-deux-points-barres le premier segment est l'hote`() {
        listOf(
            "meeshy://auth/magic-link?token=abc",
            "meeshy://auth/magic-link/abc",
            "meeshy://auth/verify-email?token=abc",
            "meeshy://auth/reset-password?token=abc",
            "meeshy://auth/email-link?token=abc",
            "meeshy://auth/email-link/magic-link#token=abc",
            "meeshy://reset-password#token=abc",
            "meeshy://account/deletion?token=abc",
            "meeshy://settings/verify-email-change?token=abc",
            "MEESHY://auth/magic-link?token=abc",
            "Meeshy://Auth/Magic-Link?token=abc",
        ).forEach(::assertUrlCarries)
    }

    @Test
    fun `une adresse ordinaire ne porte aucun secret`() {
        listOf(
            "https://meeshy.me/",
            "https://meeshy.me/chat/abc",
            "https://meeshy.me/p/123?token=abc",
            "https://meeshy.me/auth/login",
            "https://meeshy.me/auth/magic-linker",
            "https://example.com/blog/reset-password-tips",
            "https://meeshy.me/#token=abc",
            "https://meeshy.me/login?next=%2Fchat%2Fabc",
            "https://example.com/search?q=reset+password",
            "https://meeshy.me/join/abc",
            "meeshy://chat/abc",
            "meeshy://join/abc",
            "meeshy://u/alice",
            "meeshy://conversations/abc",
            "mailto:hi@meeshy.me",
            "tel:+33123456789",
        ).forEach(::assertUrlIsOrdinary)
    }

    @Test
    fun `une adresse illisible ferme la lecture`() {
        assertUrlCarries("not a url")
        assertUrlCarries("")
        assertUrlCarries("   ")
        assertUrlCarries("meeshy.me/auth/magic-link")
    }

    // ---------------------------------------------------------------- lecture ETROITE

    @Test
    fun `la forme exacte de chaque e-mail est reconnue`() {
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/magic-link?via=email#token=abc"))
            .isEqualTo(Form.MagicLink(pathToken = null))
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/magic-link?token=abc"))
            .isEqualTo(Form.MagicLink(pathToken = null))
        assertThat(EmailLinkSecret.exactForm("https://www.meeshy.me/auth/email-link/magic-link#token=abc"))
            .isEqualTo(Form.MagicLink(pathToken = null))
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/verify-email#token=t&email=a%40b.co"))
            .isEqualTo(Form.VerifyEmail)
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/email-link/verify-email#token=t&email=a%40b.co"))
            .isEqualTo(Form.VerifyEmail)
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/reset-password#token=r"))
            .isEqualTo(Form.ResetPassword)
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/reset-password#token=r"))
            .isEqualTo(Form.ResetPassword)
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/email-link/reset-password#token=r"))
            .isEqualTo(Form.ResetPassword)
    }

    @Test
    fun `le jeton historique ecrit dans le chemin est rendu avec sa forme`() {
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/magic-link/tok-3_A"))
            .isEqualTo(Form.MagicLink(pathToken = "tok-3_A"))
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me/auth/magic-link/ABCdef0123456789-_?via=email"))
            .isEqualTo(Form.MagicLink(pathToken = "ABCdef0123456789-_"))
    }

    @Test
    fun `le schema se lit sans casse et le port par defaut est admis`() {
        assertThat(EmailLinkSecret.exactForm("HTTPS://meeshy.me/auth/magic-link#token=abc"))
            .isEqualTo(Form.MagicLink(pathToken = null))
        assertThat(EmailLinkSecret.exactForm("https://meeshy.me:443/auth/magic-link#token=abc"))
            .isEqualTo(Form.MagicLink(pathToken = null))
    }

    @Test
    fun `toute variante de la forme exacte est refusee`() {
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
            "https://evil.example\\@meeshy.me/auth/magic-link?token=abc",
            "https://user:pass@meeshy.me/auth/magic-link?token=abc",
            "https://user@meeshy.me/auth/magic-link?token=abc",
            "https://meeshy.me:8443/auth/magic-link?token=abc",
            "https://meeshy.me:/auth/magic-link?token=abc",
            "http://meeshy.me/auth/magic-link?token=abc",
        ).forEach(::assertNoExactForm)
    }

    @Test
    fun `un jeton de chemin mal forme ne donne aucune forme`() {
        assertNoExactForm("https://meeshy.me/auth/magic-link/ab%20c")
        assertNoExactForm("https://meeshy.me/auth/magic-link/ab.c")
        assertNoExactForm("https://meeshy.me/auth/magic-link/ab+c")
        assertNoExactForm("https://meeshy.me/auth/magic-link/ab%2Fc")
        assertNoExactForm("https://meeshy.me/auth/magic-link/é")
    }

    @Test
    fun `une autre adresse, un autre schema ou un texte illisible ne donne aucune forme`() {
        listOf(
            "meeshy://auth/magic-link?token=abc",
            "meeshy://auth/magic-link/abc",
            "MEESHY://auth/magic-link?token=abc",
            "https://meeshy.me/auth/login",
            "https://meeshy.me/chat/abc",
            "https://meeshy.me/auth/magic-linker",
            "javascript:alert(1)",
            "not a url",
            "",
            "https://meeshy.me/auth/magic-link?token=a b",
            "https://meeshy.me/auth/magic-link\n",
        ).forEach(::assertNoExactForm)
    }

    @Test
    fun `l'autorite ne peut pas porter d'hote deguise`() {
        assertNoExactForm("https://meeshy.me\\.evil.example/auth/magic-link?token=abc")
        assertNoExactForm("https://meeshy.me%2F@evil.example/auth/magic-link?token=abc")
    }
}

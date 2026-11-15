package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

class LinkSignInConfirmationContentTest {

    private fun question(
        displayName: String? = "Alice Martin",
        avatar: String? = null,
        maskedEmail: String? = "a***@mail.com",
        intent: LinkSignInIntent = LinkSignInIntent.SIGN_IN,
    ) = LoginOutcome.LinkConfirmationRequired(
        account = LinkSignInAccount(id = "u1", username = "alice", displayName = displayName, avatar = avatar),
        intent = intent,
        maskedEmail = maskedEmail,
    )

    @Test
    fun `le titre s'ecrit avec le pseudo et la carte montre nom et adresse masquee`() {
        val content = LinkSignInConfirmationContent.of(question(), signedIn = null)

        assertThat(content.handle).isEqualTo("@alice")
        assertThat(content.displayName).isEqualTo("Alice Martin")
        assertThat(content.maskedEmail).isEqualTo("a***@mail.com")
        assertThat(content.incomingLabel).isEqualTo("Alice Martin (@alice)")
        assertThat(content.accountAccessibilityLabel).isEqualTo("Alice Martin (@alice), a***@mail.com")
        assertThat(content.currentLabel).isNull()
        assertThat(content.claimsEmail).isFalse()
    }

    @Test
    fun `un nom blanc ou qui repete le pseudo n'est pas affiche`() {
        assertThat(LinkSignInConfirmationContent.of(question(displayName = "  "), null).displayName).isNull()
        assertThat(LinkSignInConfirmationContent.of(question(displayName = "alice"), null).displayName).isNull()
        assertThat(LinkSignInConfirmationContent.of(question(displayName = null), null).incomingLabel).isEqualTo("@alice")
    }

    @Test
    fun `une adresse absente ou blanche ne s'affiche pas`() {
        val content = LinkSignInConfirmationContent.of(question(maskedEmail = "  "), null)

        assertThat(content.maskedEmail).isNull()
        assertThat(content.accountAccessibilityLabel).isEqualTo("Alice Martin (@alice)")
    }

    @Test
    fun `la revendication d'adresse se lit sur l'intention`() {
        val content = LinkSignInConfirmationContent.of(question(intent = LinkSignInIntent.CLAIM_EMAIL), null)

        assertThat(content.claimsEmail).isTrue()
    }

    @Test
    fun `le compte ouvert est nomme quand il y en a un`() {
        val current = MeeshyUser(id = "u2", username = "bob", displayName = "Bob")

        assertThat(LinkSignInConfirmationContent.of(question(), current).currentLabel).isEqualTo("Bob (@bob)")
    }

    @Test
    fun `l'avatar ne se charge que depuis Meeshy`() {
        fun avatar(url: String?) = LinkSignInConfirmationContent.of(question(avatar = url), null).avatarUrl

        assertThat(avatar("https://meeshy.me/a.png")).isEqualTo("https://meeshy.me/a.png")
        assertThat(avatar("https://cdn.meeshy.me/a.png")).isNotNull()
        assertThat(avatar("/u/a.png")).isEqualTo("/u/a.png")
        assertThat(avatar("https://evil.example/pixel.png")).isNull()
        assertThat(avatar("https://meeshy.me.evil.example/a.png")).isNull()
        assertThat(avatar("https://user@meeshy.me/a.png")).isNull()
        assertThat(avatar("http://meeshy.me/a.png")).isNull()
        assertThat(avatar("//evil.example/a.png")).isNull()
        assertThat(avatar(null)).isNull()
    }
}

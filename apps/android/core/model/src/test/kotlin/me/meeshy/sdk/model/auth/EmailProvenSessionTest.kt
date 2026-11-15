package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

class EmailProvenSessionTest {

    private val session = AuthSession(user = MeeshyUser(id = "u1", username = "a"), token = "jwt")

    @Test
    fun `une session servie avec un delai applique la fenetre moins la marge`() {
        val proof = EmailProof.served(LoginOutcome.Authenticated(session, adoptWithinSeconds = 300), receivedAtMs = 10)

        val proven = (proof as EmailProof.Session).proven
        assertThat(proven.adoptableForMs).isEqualTo(240_000L)
        assertThat(proven.receivedAtMs).isEqualTo(10L)
    }

    @Test
    fun `une session sans delai servi vaut le repli de 9 minutes`() {
        val proven = (EmailProof.served(LoginOutcome.Authenticated(session), 0) as EmailProof.Session).proven
        assertThat(proven.adoptableForMs).isEqualTo(9 * 60_000L)
    }

    @Test
    fun `un defi de second facteur sans delai servi vaut le repli de 4 minutes`() {
        val required = (EmailProof.served(LoginOutcome.TwoFactorRequired("t"), 0) as EmailProof.SecondFactor).required
        assertThat(required.adoptableForMs).isEqualTo(4 * 60_000L)
        assertThat(required.twoFactorToken).isEqualTo("t")
    }

    @Test
    fun `la confirmation de lien ne porte aucune session`() {
        val outcome = LoginOutcome.LinkConfirmationRequired(LinkSignInAccount("a", "alice"))
        assertThat(EmailProof.served(outcome, 0)).isEqualTo(EmailProof.LinkConfirmation(outcome))
    }

    @Test
    fun `une adresse encore a prouver n'est pas une preuve`() {
        val pending = LoginOutcome.VerificationRequired(PendingEmailVerification("a@b.c", false))
        assertThat(EmailProof.served(pending, 0)).isNull()
    }

    @Test
    fun `une preuve hors fenetre est perimee`() {
        val proven = EmailProvenSession(session, receivedAtMs = 0, adoptableForMs = 1_000)
        assertThat(proven.hasLapsedAdoptionWindow(1_000)).isFalse()
        assertThat(proven.hasLapsedAdoptionWindow(1_001)).isTrue()
    }
}

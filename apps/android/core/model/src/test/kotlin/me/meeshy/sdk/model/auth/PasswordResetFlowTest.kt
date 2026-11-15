package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Le parcours « Nouveau mot de passe » (#13465), miroir de `PasswordResetFlow` / `PasswordResetOutcome` (iOS, SDK). */
class PasswordResetFlowTest {

    private fun outcome(status: Int?, code: String? = null, message: String = ""): PasswordResetOutcome =
        PasswordResetOutcome.of(httpStatus = status, code = code, message = message)

    @Test
    fun `le code de la passerelle prime sur le texte`() {
        assertThat(outcome(400, "RESET_TOKEN_INVALID", "whatever")).isEqualTo(PasswordResetOutcome.InvalidToken)
        assertThat(outcome(400, "TWO_FACTOR_ATTEMPTS_EXHAUSTED")).isEqualTo(PasswordResetOutcome.AttemptsExhausted)
        assertThat(outcome(400, "RESET_PASSWORD_WEAK")).isEqualTo(PasswordResetOutcome.WeakPassword)
        assertThat(outcome(400, "RESET_PASSWORD_REUSED")).isEqualTo(PasswordResetOutcome.ReusedPassword)
        assertThat(outcome(400, "TWO_FACTOR_REQUIRED")).isEqualTo(PasswordResetOutcome.SecondFactorRequired)
        assertThat(outcome(400, "TWO_FACTOR_INVALID")).isEqualTo(PasswordResetOutcome.SecondFactorInvalid)
        assertThat(outcome(400, "ACCOUNT_LOCKED")).isEqualTo(PasswordResetOutcome.AccountLocked)
    }

    @Test
    fun `une passerelle plus ancienne que l'app est lue sur son texte historique`() {
        assertThat(outcome(400, null, "Invalid or expired reset token")).isEqualTo(PasswordResetOutcome.InvalidToken)
        assertThat(outcome(400, null, "Password requirements: too short")).isEqualTo(PasswordResetOutcome.WeakPassword)
        assertThat(outcome(400, null, "Invalid 2FA code")).isEqualTo(PasswordResetOutcome.SecondFactorInvalid)
        assertThat(outcome(400, null, "2FA code required")).isEqualTo(PasswordResetOutcome.SecondFactorRequired)
    }

    @Test
    fun `reseau, limite de debit et pannes`() {
        assertThat(outcome(null, "NETWORK", "offline")).isEqualTo(PasswordResetOutcome.Offline)
        assertThat(outcome(429)).isEqualTo(PasswordResetOutcome.RateLimited)
        assertThat(outcome(500, "BOOM")).isEqualTo(PasswordResetOutcome.Failed("BOOM"))
        assertThat(outcome(400, "UNKNOWN_THING")).isEqualTo(PasswordResetOutcome.Failed("UNKNOWN_THING"))
        assertThat(outcome(502)).isEqualTo(PasswordResetOutcome.Failed("502"))
        assertThat(outcome(null)).isEqualTo(PasswordResetOutcome.Failed("0"))
    }

    @Test
    fun `un jeton que la passerelle ne dit pas valide est un lien mort`() {
        val flow = PasswordResetFlow().verified(ResetTokenVerification(valid = false, requires2FA = true))
        assertThat(flow.phase).isEqualTo(PasswordResetFlow.Phase.LINK_INVALID)
    }

    @Test
    fun `un compte protege reclame le code des l'ouverture`() {
        val flow = PasswordResetFlow().verified(ResetTokenVerification(valid = true, requires2FA = true))
        assertThat(flow.phase).isEqualTo(PasswordResetFlow.Phase.FORM)
        assertThat(flow.requiresSecondFactor).isTrue()
    }

    @Test
    fun `chaque issue a sa page ou sa raison`() {
        val base = PasswordResetFlow()
        assertThat(base.resolved(PasswordResetOutcome.Saved).phase).isEqualTo(PasswordResetFlow.Phase.SAVED)
        assertThat(base.resolved(PasswordResetOutcome.InvalidToken).phase).isEqualTo(PasswordResetFlow.Phase.LINK_INVALID)
        assertThat(base.resolved(PasswordResetOutcome.AttemptsExhausted).phase).isEqualTo(PasswordResetFlow.Phase.ATTEMPTS_EXHAUSTED)
        val required = base.resolved(PasswordResetOutcome.SecondFactorRequired)
        assertThat(required.requiresSecondFactor).isTrue()
        assertThat(required.notice).isEqualTo(PasswordResetFlow.Notice.SecondFactorRequired)
        val weak = base.resolved(PasswordResetOutcome.WeakPassword)
        assertThat(weak.phase).isEqualTo(PasswordResetFlow.Phase.FORM)
        assertThat(weak.notice).isEqualTo(PasswordResetFlow.Notice.WeakPassword)
        assertThat(base.resolved(PasswordResetOutcome.Failed("X")).notice).isEqualTo(PasswordResetFlow.Notice.Failed("X"))
    }

    @Test
    fun `on n'envoie qu'un formulaire complet et confirme`() {
        val plain = PasswordResetFlow()
        assertThat(plain.canSubmit("abc", "abc", "")).isTrue()
        assertThat(plain.canSubmit("", "", "")).isFalse()
        assertThat(plain.canSubmit("abc", "abd", "")).isFalse()
        val protectedAccount = PasswordResetFlow(requiresSecondFactor = true)
        assertThat(protectedAccount.canSubmit("abc", "abc", "12345")).isFalse()
        assertThat(protectedAccount.canSubmit("abc", "abc", "123456")).isTrue()
    }

    @Test
    fun `le code ne garde que six chiffres ASCII et ne part que pour un compte protege`() {
        assertThat(PasswordResetFlow.sanitizedCode("12 34-56789")).isEqualTo("123456")
        assertThat(PasswordResetFlow.sanitizedCode("٣٤٥")).isEmpty()
        assertThat(PasswordResetFlow().submittedCode("123456")).isNull()
        assertThat(PasswordResetFlow(requiresSecondFactor = true).submittedCode("12a3456")).isEqualTo("123456")
    }

    @Test
    fun `effacer la raison garde la page et l'exigence du code`() {
        val flow = PasswordResetFlow(requiresSecondFactor = true).resolved(PasswordResetOutcome.SecondFactorInvalid).clearingNotice()
        assertThat(flow.notice).isNull()
        assertThat(flow.requiresSecondFactor).isTrue()
    }
}

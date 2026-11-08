package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LoginFlowTest {

    @Test
    fun `a challenge moves the form to the two factor step carrying the token`() {
        val next = LoginFlow.Form.reduce(LoginFlowEvent.ChallengeIssued("tok"))
        assertThat(next).isEqualTo(LoginFlow.TwoFactor("tok"))
    }

    @Test
    fun `a blank challenge token never opens the step`() {
        assertThat(LoginFlow.Form.reduce(LoginFlowEvent.ChallengeIssued(" "))).isEqualTo(LoginFlow.Form)
    }

    @Test
    fun `cancelling returns to the form`() {
        assertThat(LoginFlow.TwoFactor("tok").reduce(LoginFlowEvent.Cancelled)).isEqualTo(LoginFlow.Form)
    }

    @Test
    fun `success authenticates`() {
        assertThat(LoginFlow.TwoFactor("tok").reduce(LoginFlowEvent.Succeeded)).isEqualTo(LoginFlow.Authenticated)
    }

    @Test
    fun `an expired token sends back to the form while a wrong code stays on the step`() {
        val step = LoginFlow.TwoFactor("tok")
        assertThat(step.reduce(LoginFlowEvent.Refused(TwoFactorRefusal.TOKEN_EXPIRED))).isEqualTo(LoginFlow.Form)
        assertThat(step.reduce(LoginFlowEvent.Refused(TwoFactorRefusal.INVALID_CODE))).isEqualTo(step)
        assertThat(step.reduce(LoginFlowEvent.Refused(TwoFactorRefusal.TOO_MANY_ATTEMPTS))).isEqualTo(step)
        assertThat(step.reduce(LoginFlowEvent.Refused(TwoFactorRefusal.OFFLINE))).isEqualTo(step)
    }

    @Test
    fun `a stale event does not leave the authenticated state`() {
        assertThat(LoginFlow.Authenticated.reduce(LoginFlowEvent.Cancelled)).isEqualTo(LoginFlow.Authenticated)
    }

    @Test
    fun `the gateway refusals are told apart`() {
        assertThat(TwoFactorRefusal.classify("NETWORK", null, null)).isEqualTo(TwoFactorRefusal.OFFLINE)
        assertThat(TwoFactorRefusal.classify("RATE_LIMITED", 429, null)).isEqualTo(TwoFactorRefusal.TOO_MANY_ATTEMPTS)
        assertThat(TwoFactorRefusal.classify(null, 429, null)).isEqualTo(TwoFactorRefusal.TOO_MANY_ATTEMPTS)
        assertThat(TwoFactorRefusal.classify("TWO_FACTOR_FAILED", 401, "Compte temporairement verrouillé après trop de tentatives. Réessayez plus tard."))
            .isEqualTo(TwoFactorRefusal.TOO_MANY_ATTEMPTS)
        assertThat(TwoFactorRefusal.classify("TWO_FACTOR_FAILED", 401, "Token 2FA invalide ou expiré. Veuillez vous reconnecter."))
            .isEqualTo(TwoFactorRefusal.TOKEN_EXPIRED)
        assertThat(TwoFactorRefusal.classify("TWO_FACTOR_FAILED", 401, "Code 2FA invalide"))
            .isEqualTo(TwoFactorRefusal.INVALID_CODE)
        assertThat(TwoFactorRefusal.classify("TWO_FACTOR_FAILED", 401, null)).isEqualTo(TwoFactorRefusal.INVALID_CODE)
        assertThat(TwoFactorRefusal.classify("PARSE", null, null)).isEqualTo(TwoFactorRefusal.UNEXPECTED)
        assertThat(TwoFactorRefusal.classify(null, 500, null)).isEqualTo(TwoFactorRefusal.UNEXPECTED)
    }
}

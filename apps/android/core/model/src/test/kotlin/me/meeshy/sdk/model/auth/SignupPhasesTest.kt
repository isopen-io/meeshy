package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SignupPhasesTest {

    private val editing = SignupCardStage.Editing

    @Test
    fun `a l'ouverture seule la phase du numero parait`() {
        assertThat(SignupPhases.phase(SignupProgress.INITIAL, editing)).isEqualTo(SignupPhase.PHONE)
    }

    @Test
    fun `un numero plausible ouvre l'adresse, une adresse valide ouvre la carte`() {
        val email = SignupProgress.INITIAL.advanced(phoneGiven = true, emailValid = false)
        assertThat(SignupPhases.phase(email, editing)).isEqualTo(SignupPhase.EMAIL)
        val card = email.advanced(phoneGiven = true, emailValid = true)
        assertThat(SignupPhases.phase(card, editing)).isEqualTo(SignupPhase.CARD)
    }

    @Test
    fun `une adresse valide sans numero n'ouvre pas la carte`() {
        val p = SignupProgress.INITIAL.advanced(phoneGiven = false, emailValid = true)
        assertThat(p).isEqualTo(SignupProgress.INITIAL)
    }

    @Test
    fun `les phases ne disparaissent jamais`() {
        val card = SignupProgress.INITIAL.advanced(true, true)
        val after = card.advanced(phoneGiven = false, emailValid = false)
        assertThat(after).isEqualTo(card)
        assertThat(SignupPhases.phase(after, editing)).isEqualTo(SignupPhase.CARD)
    }

    @Test
    fun `la carte ne saute pas l'adresse`() {
        val p = SignupProgress.INITIAL.advanced(phoneGiven = true, emailValid = true)
        assertThat(p.emailShown).isTrue()
        assertThat(p.cardShown).isTrue()
    }

    @Test
    fun `le code puis la validation priment sur l'edition`() {
        val card = SignupProgress.INITIAL.advanced(true, true)
        assertThat(SignupPhases.phase(card, SignupCardStage.AwaitingCode(signedIn = true))).isEqualTo(SignupPhase.CODE)
        assertThat(SignupPhases.phase(SignupProgress.INITIAL, SignupCardStage.Verified)).isEqualTo(SignupPhase.VERIFIED)
    }

    @Test
    fun `action principale par phase`() {
        val card = SignupProgress.INITIAL.advanced(true, true)
        assertThat(SignupPhases.primaryAction(SignupProgress.INITIAL, editing, formReady = true))
            .isEqualTo(SignupPrimaryAction.SignUp(enabled = false))
        assertThat(SignupPhases.primaryAction(card, editing, formReady = false))
            .isEqualTo(SignupPrimaryAction.SignUp(enabled = false))
        assertThat(SignupPhases.primaryAction(card, editing, formReady = true))
            .isEqualTo(SignupPrimaryAction.SignUp(enabled = true))
        assertThat(SignupPhases.primaryAction(card, SignupCardStage.AwaitingCode(signedIn = false), true))
            .isEqualTo(SignupPrimaryAction.SignUp(enabled = false))
        assertThat(SignupPhases.primaryAction(card, SignupCardStage.AwaitingCode(signedIn = true), false))
            .isEqualTo(SignupPrimaryAction.SignUp(enabled = true))
        assertThat(SignupPhases.primaryAction(card, SignupCardStage.Verified, true)).isEqualTo(SignupPrimaryAction.Talk)
    }

    @Test
    fun `phoneRefusalShown est une fonction pure`() {
        val none = SignupProgress.INITIAL
        val emailShown = SignupProgress(emailShown = true)
        assertThat(SignupPhases.phoneRefusalShown(refused = true, checked = false, progress = none)).isFalse()
        assertThat(SignupPhases.phoneRefusalShown(refused = true, checked = true, progress = none)).isTrue()
        assertThat(SignupPhases.phoneRefusalShown(refused = true, checked = false, progress = emailShown)).isTrue()
        assertThat(SignupPhases.phoneRefusalShown(refused = false, checked = true, progress = emailShown)).isFalse()
    }

    @Test
    fun `le mot de passe ne se referme jamais`() {
        assertThat(SignupPhases.passwordRevealed(alreadyRevealed = false, identityDefined = false)).isFalse()
        assertThat(SignupPhases.passwordRevealed(alreadyRevealed = false, identityDefined = true)).isTrue()
        assertThat(SignupPhases.passwordRevealed(alreadyRevealed = true, identityDefined = false)).isTrue()
    }
}

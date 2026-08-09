package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [RegistrationStepContent] — the single source of truth
 * for which [RegistrationStep]s have real field UI wired in the Compose
 * registration wizard (`RegistrationScreen`) versus an inert "coming soon"
 * placeholder body.
 *
 * Grows by one entry per step-UI slice (see `auth-onboarding-shell`,
 * `feature-parity.md` §A "App-side registration wizard ViewModel wiring" scope
 * note): a step's body renders for real once it's added to the implemented
 * set, keeping the "is this step wired yet" decision in one testable place
 * instead of an inline `when` silently drifting from what the wizard actually
 * ships.
 */
class RegistrationStepContentTest {

    @Test
    fun isImplemented_pseudo_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.PSEUDO)).isTrue()
    }

    @Test
    fun isImplemented_phone_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.PHONE)).isTrue()
    }

    @Test
    fun isImplemented_email_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.EMAIL)).isTrue()
    }

    @Test
    fun isImplemented_identity_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.IDENTITY)).isTrue()
    }

    @Test
    fun isImplemented_password_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.PASSWORD)).isTrue()
    }

    @Test
    fun isImplemented_language_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.LANGUAGE)).isTrue()
    }

    @Test
    fun isImplemented_recap_isTrue() {
        assertThat(RegistrationStepContent.isImplemented(RegistrationStep.RECAP)).isTrue()
    }

    @Test
    fun isImplemented_everyStepOtherThanPseudoPhoneEmailIdentityPasswordLanguageAndRecap_isFalse() {
        val implementedSoFar = setOf(
            RegistrationStep.PSEUDO,
            RegistrationStep.PHONE,
            RegistrationStep.EMAIL,
            RegistrationStep.IDENTITY,
            RegistrationStep.PASSWORD,
            RegistrationStep.LANGUAGE,
            RegistrationStep.RECAP,
        )
        RegistrationStep.ordered
            .filter { it !in implementedSoFar }
            .forEach { step ->
                assertThat(RegistrationStepContent.isImplemented(step)).isFalse()
            }
    }
}

package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure per-step proceed gate [RegistrationStepGate]
 * backing the 8-step gamified registration wizard.
 *
 * Parity source: iOS `RegistrationViewModel.canProceed`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`), the
 * computed `switch currentStep` var that answers whether the bottom bar's
 * Next/Register button may advance:
 *   - `.pseudo`   → `isUsernameValidLocally && usernameAvailable == true`
 *   - `.phone`    → `skipPhone || (digits.count >= 8 && phoneAvailable == true)`
 *   - `.email`    → `isEmailValidLocally && emailAvailable == true`
 *   - `.identity` → firstName & lastName both non-blank (trimmed)
 *   - `.password` → `password.count >= 8 && password == confirmPassword`
 *   - `.language` → `!systemLanguage.isEmpty`
 *   - `.profile`  → `true` (optional step)
 *   - `.recap`    → `acceptTerms`
 *
 * SOTA note: iOS buries this eight-arm decision in a stateful ViewModel computed
 * var reading `@Published` fields directly. Android lifts it into one
 * framework-free SSOT over an immutable [RegistrationFields] snapshot, reusing the
 * already-shipped per-field cores ([SignupAvailabilityPolicy], [PasswordEntry])
 * rather than re-implementing their rules — so the whole wizard's advance
 * decision is JVM-testable in one place and the ViewModel stays a thin caller
 * that feeds this boolean into [RegistrationStepNavigator.advance].
 *
 * Every assertion is on observable behaviour through the public API. Expectations
 * are hand-written literals, independent of how production derives them.
 */
class RegistrationStepGateTest {

    private fun fields(
        username: String = "",
        usernameAvailable: Boolean? = null,
        phoneNumber: String = "",
        phoneAvailable: Boolean? = null,
        skipPhone: Boolean = false,
        email: String = "",
        emailAvailable: Boolean? = null,
        firstName: String = "",
        lastName: String = "",
        password: String = "",
        confirmPassword: String = "",
        systemLanguage: String = "",
        acceptTerms: Boolean = false,
    ) = RegistrationFields(
        username = username,
        usernameAvailable = usernameAvailable,
        phoneNumber = phoneNumber,
        phoneAvailable = phoneAvailable,
        skipPhone = skipPhone,
        email = email,
        emailAvailable = emailAvailable,
        firstName = firstName,
        lastName = lastName,
        password = password,
        confirmPassword = confirmPassword,
        systemLanguage = systemLanguage,
        acceptTerms = acceptTerms,
    )

    private fun canProceed(step: RegistrationStep, f: RegistrationFields) =
        RegistrationStepGate.canProceed(step, f)

    // --- PSEUDO: delegates to SignupAvailabilityPolicy.usernameStepCanProceed ---

    @Test
    fun pseudo_validAndAvailable_proceeds() {
        assertThat(canProceed(RegistrationStep.PSEUDO, fields(username = "alice", usernameAvailable = true)))
            .isTrue()
    }

    @Test
    fun pseudo_locallyInvalid_blocks() {
        assertThat(canProceed(RegistrationStep.PSEUDO, fields(username = "a", usernameAvailable = true)))
            .isFalse()
    }

    @Test
    fun pseudo_availabilityUnknown_blocks() {
        assertThat(canProceed(RegistrationStep.PSEUDO, fields(username = "alice", usernameAvailable = null)))
            .isFalse()
    }

    @Test
    fun pseudo_availabilityFalse_blocks() {
        assertThat(canProceed(RegistrationStep.PSEUDO, fields(username = "alice", usernameAvailable = false)))
            .isFalse()
    }

    // --- PHONE: delegates to SignupAvailabilityPolicy.phoneStepCanProceed ---

    @Test
    fun phone_skipped_proceedsEvenWithShortNumber() {
        assertThat(canProceed(RegistrationStep.PHONE, fields(phoneNumber = "12", skipPhone = true)))
            .isTrue()
    }

    @Test
    fun phone_enteredValidAndAvailable_proceeds() {
        assertThat(
            canProceed(
                RegistrationStep.PHONE,
                fields(phoneNumber = "+33612345678", phoneAvailable = true),
            ),
        ).isTrue()
    }

    @Test
    fun phone_enteredTooShort_blocks() {
        assertThat(
            canProceed(
                RegistrationStep.PHONE,
                fields(phoneNumber = "123", phoneAvailable = true),
            ),
        ).isFalse()
    }

    @Test
    fun phone_enteredButAvailabilityUnknown_blocks() {
        assertThat(
            canProceed(
                RegistrationStep.PHONE,
                fields(phoneNumber = "+33612345678", phoneAvailable = null),
            ),
        ).isFalse()
    }

    // --- EMAIL: delegates to SignupAvailabilityPolicy.emailStepCanProceed ---

    @Test
    fun email_validAndAvailable_proceeds() {
        assertThat(
            canProceed(RegistrationStep.EMAIL, fields(email = "a@b.com", emailAvailable = true)),
        ).isTrue()
    }

    @Test
    fun email_locallyInvalid_blocks() {
        assertThat(
            canProceed(RegistrationStep.EMAIL, fields(email = "not-an-email", emailAvailable = true)),
        ).isFalse()
    }

    @Test
    fun email_availabilityUnknown_blocks() {
        assertThat(
            canProceed(RegistrationStep.EMAIL, fields(email = "a@b.com", emailAvailable = null)),
        ).isFalse()
    }

    // --- IDENTITY: firstName AND lastName both non-blank (trimmed, iOS) ---

    @Test
    fun identity_bothNamesPresent_proceeds() {
        assertThat(
            canProceed(RegistrationStep.IDENTITY, fields(firstName = "Ada", lastName = "Lovelace")),
        ).isTrue()
    }

    @Test
    fun identity_firstNameBlank_blocks() {
        assertThat(
            canProceed(RegistrationStep.IDENTITY, fields(firstName = "", lastName = "Lovelace")),
        ).isFalse()
    }

    @Test
    fun identity_lastNameBlank_blocks() {
        assertThat(
            canProceed(RegistrationStep.IDENTITY, fields(firstName = "Ada", lastName = "")),
        ).isFalse()
    }

    @Test
    fun identity_bothBlank_blocks() {
        assertThat(canProceed(RegistrationStep.IDENTITY, fields())).isFalse()
    }

    @Test
    fun identity_whitespaceOnlyName_blocks() {
        assertThat(
            canProceed(RegistrationStep.IDENTITY, fields(firstName = "   ", lastName = "Lovelace")),
        ).isFalse()
    }

    // --- PASSWORD: delegates to PasswordEntry.evaluate(...).canProceed ---

    @Test
    fun password_longEnoughAndMatching_proceeds() {
        assertThat(
            canProceed(
                RegistrationStep.PASSWORD,
                fields(password = "hunter22", confirmPassword = "hunter22"),
            ),
        ).isTrue()
    }

    @Test
    fun password_tooShort_blocks() {
        assertThat(
            canProceed(RegistrationStep.PASSWORD, fields(password = "abc", confirmPassword = "abc")),
        ).isFalse()
    }

    @Test
    fun password_mismatch_blocks() {
        assertThat(
            canProceed(
                RegistrationStep.PASSWORD,
                fields(password = "hunter22", confirmPassword = "hunter23"),
            ),
        ).isFalse()
    }

    // --- LANGUAGE: !systemLanguage.isEmpty (iOS) ---

    @Test
    fun language_selected_proceeds() {
        assertThat(canProceed(RegistrationStep.LANGUAGE, fields(systemLanguage = "fr"))).isTrue()
    }

    @Test
    fun language_unselected_blocks() {
        assertThat(canProceed(RegistrationStep.LANGUAGE, fields(systemLanguage = ""))).isFalse()
    }

    // --- PROFILE: always true (optional step) ---

    @Test
    fun profile_alwaysProceeds_evenWithEmptyFields() {
        assertThat(canProceed(RegistrationStep.PROFILE, fields())).isTrue()
    }

    // --- RECAP: acceptTerms ---

    @Test
    fun recap_termsAccepted_proceeds() {
        assertThat(canProceed(RegistrationStep.RECAP, fields(acceptTerms = true))).isTrue()
    }

    @Test
    fun recap_termsNotAccepted_blocks() {
        assertThat(canProceed(RegistrationStep.RECAP, fields(acceptTerms = false))).isFalse()
    }

    // --- Compositions across the whole wizard ---

    @Test
    fun everyStepProceeds_forAFullyValidSnapshot() {
        val complete = fields(
            username = "alice",
            usernameAvailable = true,
            phoneNumber = "+33612345678",
            phoneAvailable = true,
            email = "a@b.com",
            emailAvailable = true,
            firstName = "Ada",
            lastName = "Lovelace",
            password = "hunter22",
            confirmPassword = "hunter22",
            systemLanguage = "fr",
            acceptTerms = true,
        )
        RegistrationStep.ordered.forEach { step ->
            assertThat(canProceed(step, complete)).isTrue()
        }
    }

    @Test
    fun onlyProfileProceeds_forAnEmptySnapshot() {
        val empty = fields()
        RegistrationStep.ordered.forEach { step ->
            assertThat(canProceed(step, empty))
                .isEqualTo(step == RegistrationStep.PROFILE)
        }
    }
}

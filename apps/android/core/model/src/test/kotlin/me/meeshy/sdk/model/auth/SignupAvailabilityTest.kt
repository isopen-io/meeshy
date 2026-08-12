package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure signup local-validation gate + availability
 * debounce policy.
 *
 * Parity source: iOS `RegistrationViewModel` — `isUsernameValidLocally`,
 * `isEmailValidLocally`, the phone `digits.count >= 8` guard, the three
 * `.debounce(1s).removeDuplicates().sink { guard localValid }` chains, and the
 * `.pseudo`/`.phone`/`.email` arms of `canProceed`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`).
 *
 * Every assertion is on observable behaviour through the public API — the
 * validity verdict, the normalized query, the emitted [AvailabilityIntent], and
 * the step proceed gate — never on internal shape. Expectations are hand-written
 * literals independent of how production derives them (not tautological).
 */
class SignupAvailabilityTest {

    // --- isUsernameValidLocally ---

    @Test
    fun username_minBoundary_twoChars_isValid() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("ab")).isTrue()
    }

    @Test
    fun username_oneChar_isTooShort() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("a")).isFalse()
    }

    @Test
    fun username_maxBoundary_sixteenChars_isValid() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("abcdefghij123456")).isTrue()
    }

    @Test
    fun username_seventeenChars_isTooLong() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("abcdefghij1234567")).isFalse()
    }

    @Test
    fun username_lengthMeasuredAfterTrim() {
        // Padded to 20 raw chars but only 2 significant → still valid.
        assertThat(SignupFieldValidation.isUsernameValidLocally("         ab         ")).isTrue()
    }

    @Test
    fun username_trailingWhitespaceThatWouldExceedMaxIsTrimmedAway() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("  abcdefghij123456  ")).isTrue()
    }

    @Test
    fun username_whitespaceOnly_isInvalid() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("    ")).isFalse()
    }

    @Test
    fun username_empty_isInvalid() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("")).isFalse()
    }

    @Test
    fun username_underscoreAndHyphen_areAllowed() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("a_b-c")).isTrue()
    }

    @Test
    fun username_interiorSpace_isRejected() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("ab cd")).isFalse()
    }

    @Test
    fun username_dotIsRejected() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("a.b")).isFalse()
    }

    @Test
    fun username_atSignIsRejected() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("a@b")).isFalse()
    }

    @Test
    fun username_digitsOnly_areValid() {
        assertThat(SignupFieldValidation.isUsernameValidLocally("42")).isTrue()
    }

    // --- normalizedUsername ---

    @Test
    fun normalizedUsername_trimsButPreservesCase() {
        assertThat(SignupFieldValidation.normalizedUsername("  AbC  ")).isEqualTo("AbC")
    }

    // --- isEmailValidLocally ---

    @Test
    fun email_withAtAndDot_isValid() {
        assertThat(SignupFieldValidation.isEmailValidLocally("a@b.co")).isTrue()
    }

    @Test
    fun email_missingAt_isInvalid() {
        assertThat(SignupFieldValidation.isEmailValidLocally("ab.co")).isFalse()
    }

    @Test
    fun email_missingDot_isInvalid() {
        assertThat(SignupFieldValidation.isEmailValidLocally("a@bco")).isFalse()
    }

    @Test
    fun email_empty_isInvalid() {
        assertThat(SignupFieldValidation.isEmailValidLocally("")).isFalse()
    }

    // --- normalizedEmail ---

    @Test
    fun normalizedEmail_trimsAndLowercases() {
        assertThat(SignupFieldValidation.normalizedEmail("  User@Example.COM  "))
            .isEqualTo("user@example.com")
    }

    // --- phone digits + local validity ---

    @Test
    fun phoneDigits_stripsFormattingAndLetters() {
        assertThat(SignupFieldValidation.phoneDigits("+1 (234) 567-89ab"))
            .isEqualTo("123456789")
    }

    @Test
    fun phone_eightDigits_isValid() {
        assertThat(SignupFieldValidation.isPhoneValidLocally("12 34 56 78")).isTrue()
    }

    @Test
    fun phone_sevenDigits_isInvalid() {
        assertThat(SignupFieldValidation.isPhoneValidLocally("123-45-67")).isFalse()
    }

    @Test
    fun phone_empty_isInvalid() {
        assertThat(SignupFieldValidation.isPhoneValidLocally("")).isFalse()
    }

    // --- AvailabilityIntent: dedup (removeDuplicates) ---

    @Test
    fun usernameIntent_unchangedRawValue_isUnchanged() {
        assertThat(SignupAvailabilityPolicy.usernameIntent("bob", previous = "bob"))
            .isEqualTo(AvailabilityIntent.Unchanged)
    }

    @Test
    fun usernameIntent_dedupWinsEvenWhenValueIsValid() {
        // A valid value that equals the last emission must still short-circuit as
        // Unchanged — never re-hit the network for an already-checked value.
        assertThat(SignupAvailabilityPolicy.usernameIntent("valid_name", previous = "valid_name"))
            .isEqualTo(AvailabilityIntent.Unchanged)
    }

    @Test
    fun usernameIntent_firstEmissionHasNoPrevious() {
        // previous == null (nothing emitted yet) must not read as Unchanged.
        assertThat(SignupAvailabilityPolicy.usernameIntent("bob", previous = null))
            .isEqualTo(AvailabilityIntent.Check("bob"))
    }

    // --- AvailabilityIntent: username ---

    @Test
    fun usernameIntent_validChangedValue_checksNormalizedQuery() {
        assertThat(SignupAvailabilityPolicy.usernameIntent("  Bob  ", previous = "old"))
            .isEqualTo(AvailabilityIntent.Check("Bob"))
    }

    @Test
    fun usernameIntent_invalidChangedValue_clears() {
        assertThat(SignupAvailabilityPolicy.usernameIntent("a", previous = "old"))
            .isEqualTo(AvailabilityIntent.Clear)
    }

    // --- AvailabilityIntent: email ---

    @Test
    fun emailIntent_validChangedValue_checksNormalizedQuery() {
        assertThat(SignupAvailabilityPolicy.emailIntent("  User@Example.COM  ", previous = "old"))
            .isEqualTo(AvailabilityIntent.Check("user@example.com"))
    }

    @Test
    fun emailIntent_invalidChangedValue_clears() {
        assertThat(SignupAvailabilityPolicy.emailIntent("no-at-sign", previous = "old"))
            .isEqualTo(AvailabilityIntent.Clear)
    }

    // --- AvailabilityIntent: phone ---

    @Test
    fun phoneIntent_validChangedValue_checksDigitsQuery() {
        assertThat(SignupAvailabilityPolicy.phoneIntent("(234) 567-8901", previous = "old"))
            .isEqualTo(AvailabilityIntent.Check("2345678901"))
    }

    @Test
    fun phoneIntent_tooFewDigits_clears() {
        assertThat(SignupAvailabilityPolicy.phoneIntent("123-45-67", previous = "old"))
            .isEqualTo(AvailabilityIntent.Clear)
    }

    @Test
    fun phoneIntent_sameRawValueButNotDeduped_whenPreviousNull() {
        assertThat(SignupAvailabilityPolicy.phoneIntent("12345678", previous = null))
            .isEqualTo(AvailabilityIntent.Check("12345678"))
    }

    // --- Step proceed gates ---

    @Test
    fun usernameStep_proceedsOnlyWhenValidAndAvailableTrue() {
        assertThat(SignupAvailabilityPolicy.usernameStepCanProceed("bob", usernameAvailable = true)).isTrue()
    }

    @Test
    fun usernameStep_blockedWhenAvailabilityNull() {
        assertThat(SignupAvailabilityPolicy.usernameStepCanProceed("bob", usernameAvailable = null)).isFalse()
    }

    @Test
    fun usernameStep_blockedWhenAvailabilityFalse() {
        assertThat(SignupAvailabilityPolicy.usernameStepCanProceed("bob", usernameAvailable = false)).isFalse()
    }

    @Test
    fun usernameStep_blockedWhenLocallyInvalidEvenIfAvailableTrue() {
        // Stale availableTrue from an earlier valid value must not let an now-invalid
        // (too short) value advance.
        assertThat(SignupAvailabilityPolicy.usernameStepCanProceed("a", usernameAvailable = true)).isFalse()
    }

    @Test
    fun emailStep_proceedsOnlyWhenValidAndAvailableTrue() {
        assertThat(SignupAvailabilityPolicy.emailStepCanProceed("a@b.co", emailAvailable = true)).isTrue()
    }

    @Test
    fun emailStep_blockedWhenLocallyInvalid() {
        assertThat(SignupAvailabilityPolicy.emailStepCanProceed("no-dot@x", emailAvailable = true)).isFalse()
    }

    @Test
    fun phoneStep_proceedsWhenValidAndAvailableTrue() {
        assertThat(SignupAvailabilityPolicy.phoneStepCanProceed("12345678", phoneAvailable = true, skipPhone = false)).isTrue()
    }

    @Test
    fun phoneStep_skipPhoneAlwaysProceeds_evenWithGarbageAndNullAvailability() {
        assertThat(SignupAvailabilityPolicy.phoneStepCanProceed("x", phoneAvailable = null, skipPhone = true)).isTrue()
    }

    @Test
    fun phoneStep_blockedWhenTooFewDigitsAndNotSkipped() {
        assertThat(SignupAvailabilityPolicy.phoneStepCanProceed("123", phoneAvailable = true, skipPhone = false)).isFalse()
    }

    @Test
    fun phoneStep_blockedWhenAvailabilityNotConfirmed() {
        assertThat(SignupAvailabilityPolicy.phoneStepCanProceed("12345678", phoneAvailable = null, skipPhone = false)).isFalse()
    }
}

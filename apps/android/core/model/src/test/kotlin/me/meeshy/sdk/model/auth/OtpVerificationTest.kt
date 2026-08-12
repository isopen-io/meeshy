package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [OtpCodeField] and [OtpVerificationGate], the pure 6-digit
 * email-verification core backing the "verify your email by code" step.
 *
 * Parity source: iOS `EmailVerificationView`
 * (`apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`) — the
 * `codeField` `onChange` sanitiser (`newValue.filter(\.isNumber)` then
 * `String(filtered.prefix(6))`), the `isCodeComplete` (`code.count == 6`) gate, the
 * verify button's `.disabled(!isCodeComplete || isVerifying || verificationSuccess)`,
 * the field's `.disabled(isVerifying || verificationSuccess)`, and the resend
 * button's `.disabled(isResending || resendSuccess)` — plus
 * `EmailVerificationViewModel` (the `isVerifying` / `isResending` / `resendSuccess`
 * / `verificationSuccess` flags).
 *
 * Every assertion is on observable behaviour through the public API — the sanitised
 * string, the completeness verdict, and the four combined gates — never on internal
 * shape. Expectations are hand-written literals, independent of how production
 * derives them (not tautological).
 */
class OtpVerificationTest {

    // --- OtpCodeField.sanitize ---

    @Test
    fun sanitize_keepsCleanSixDigitCode() {
        assertThat(OtpCodeField.sanitize("123456")).isEqualTo("123456")
    }

    @Test
    fun sanitize_stripsLettersAndSymbols() {
        assertThat(OtpCodeField.sanitize("1a2-3b4")).isEqualTo("1234")
    }

    @Test
    fun sanitize_stripsSpacesFromPastedCode() {
        assertThat(OtpCodeField.sanitize("12 34 56")).isEqualTo("123456")
    }

    @Test
    fun sanitize_truncatesToSixDigits() {
        assertThat(OtpCodeField.sanitize("1234567890")).isEqualTo("123456")
    }

    @Test
    fun sanitize_truncatesAfterStrippingNonDigits() {
        assertThat(OtpCodeField.sanitize("12-34-56-78")).isEqualTo("123456")
    }

    @Test
    fun sanitize_stripsLeadingAndTrailingWhitespace() {
        assertThat(OtpCodeField.sanitize("  123456  ")).isEqualTo("123456")
    }

    @Test
    fun sanitize_emptyStaysEmpty() {
        assertThat(OtpCodeField.sanitize("")).isEqualTo("")
    }

    @Test
    fun sanitize_allNonDigitBecomesEmpty() {
        assertThat(OtpCodeField.sanitize("abc-xyz")).isEqualTo("")
    }

    @Test
    fun sanitize_dropsNonAsciiDigits() {
        // Fullwidth "１２３" are Unicode digits but not the ASCII 0-9 an OTP accepts.
        assertThat(OtpCodeField.sanitize("１２３456")).isEqualTo("456")
    }

    // --- OtpCodeField.isComplete ---

    @Test
    fun isComplete_trueForSixDigits() {
        assertThat(OtpCodeField.isComplete("123456")).isTrue()
    }

    @Test
    fun isComplete_falseForFiveDigits() {
        assertThat(OtpCodeField.isComplete("12345")).isFalse()
    }

    @Test
    fun isComplete_falseForSevenDigits() {
        assertThat(OtpCodeField.isComplete("1234567")).isFalse()
    }

    @Test
    fun isComplete_falseForEmpty() {
        assertThat(OtpCodeField.isComplete("")).isFalse()
    }

    @Test
    fun isComplete_falseForSixNonDigitChars() {
        // Length is 6 but they are not digits — the guard must reject.
        assertThat(OtpCodeField.isComplete("abcdef")).isFalse()
    }

    // --- OtpVerificationGate.canVerify ---

    @Test
    fun canVerify_trueWhenCompleteAndIdle() {
        assertThat(OtpVerificationGate().canVerify("123456")).isTrue()
    }

    @Test
    fun canVerify_falseWhenCodeIncomplete() {
        assertThat(OtpVerificationGate().canVerify("12345")).isFalse()
    }

    @Test
    fun canVerify_falseWhileVerifying() {
        assertThat(OtpVerificationGate(isVerifying = true).canVerify("123456")).isFalse()
    }

    @Test
    fun canVerify_falseOnceVerified() {
        assertThat(OtpVerificationGate(verified = true).canVerify("123456")).isFalse()
    }

    // --- OtpVerificationGate.isCodeEditable ---

    @Test
    fun isCodeEditable_trueWhenIdle() {
        assertThat(OtpVerificationGate().isCodeEditable).isTrue()
    }

    @Test
    fun isCodeEditable_falseWhileVerifying() {
        assertThat(OtpVerificationGate(isVerifying = true).isCodeEditable).isFalse()
    }

    @Test
    fun isCodeEditable_falseOnceVerified() {
        assertThat(OtpVerificationGate(verified = true).isCodeEditable).isFalse()
    }

    // --- OtpVerificationGate.canResend ---

    @Test
    fun canResend_trueWhenIdle() {
        assertThat(OtpVerificationGate().canResend).isTrue()
    }

    @Test
    fun canResend_falseWhileResending() {
        assertThat(OtpVerificationGate(isResending = true).canResend).isFalse()
    }

    @Test
    fun canResend_falseDuringConfirmationWindow() {
        assertThat(OtpVerificationGate(resendConfirmed = true).canResend).isFalse()
    }

    // --- OtpVerificationGate.showResendConfirmation ---

    @Test
    fun showResendConfirmation_trueDuringConfirmationWindow() {
        assertThat(OtpVerificationGate(resendConfirmed = true).showResendConfirmation).isTrue()
    }

    @Test
    fun showResendConfirmation_falseOtherwise() {
        assertThat(OtpVerificationGate().showResendConfirmation).isFalse()
    }
}

package me.meeshy.sdk.model.auth

/**
 * Pure input core for the 6-digit email-verification code — faithful port of the
 * `codeField` sanitiser + `isCodeComplete` gate in iOS `EmailVerificationView`
 * (`apps/ios/Meeshy/Features/Auth/Views/EmailVerificationView.swift`).
 *
 * iOS sanitises inline in the field's `onChange`
 * (`newValue.filter(\.isNumber)` then `String(filtered.prefix(6))`) and gates the
 * verify button on `code.count == 6`. Android lifts both into a pure object so a
 * Compose `TextField`'s `onValueChange` filters through one SSOT and every branch is
 * JVM-testable.
 *
 * The digit predicate is deliberately ASCII `'0'..'9'` (not [Char.isDigit], which is
 * Unicode-decimal-digit aware): the verification code is an ASCII numeric string, so
 * a pasted fullwidth or Arabic-Indic digit is stripped rather than silently accepted.
 */
object OtpCodeField {

    /** The exact code length (iOS `code.count == 6`). */
    const val LENGTH = 6

    /**
     * Keep only ASCII digits, capped at [LENGTH] — the whole `onChange` transform:
     * `filter(\.isNumber)` restricted to `0-9`, then `prefix(6)`.
     */
    fun sanitize(raw: String): String =
        raw.filter { it in '0'..'9' }.take(LENGTH)

    /**
     * Whether the code is a full, all-digit 6-character string (iOS `isCodeComplete`).
     * The digit guard defends the gate even if an un-sanitised value ever reaches it.
     */
    fun isComplete(code: String): Boolean =
        code.length == LENGTH && code.all { it in '0'..'9' }
}

/**
 * Pure derivation gates for the email-verification step — port of the button/field
 * `.disabled(...)` conditions in iOS `EmailVerificationView` over the
 * `EmailVerificationViewModel` flags.
 *
 * iOS buries these as inline `.disabled(...)` expressions across the view; Android
 * lifts them into one immutable value so the verify/resend/edit affordances derive
 * from a single SSOT and each combined gate is unit-testable. The four flags mirror
 * the view model: `isVerifying`, `isResending`, `resendSuccess`, `verificationSuccess`.
 *
 * @property isVerifying a verify request is in flight (iOS `isVerifying`).
 * @property isResending a resend request is in flight (iOS `isResending`).
 * @property resendConfirmed inside the transient "Code renvoyé !" window (iOS
 *   `resendSuccess`, which the view model holds for 3 s before clearing).
 * @property verified the code was accepted (iOS `verificationSuccess`, drives the
 *   full-screen success overlay).
 */
data class OtpVerificationGate(
    val isVerifying: Boolean = false,
    val isResending: Boolean = false,
    val resendConfirmed: Boolean = false,
    val verified: Boolean = false,
) {

    /**
     * Whether the code field accepts input — iOS
     * `.disabled(isVerifying || verificationSuccess)`.
     */
    val isCodeEditable: Boolean
        get() = !isVerifying && !verified

    /**
     * Whether the resend button is enabled — iOS
     * `.disabled(isResending || resendSuccess)`: blocked while a resend is in flight
     * or during the confirmation window.
     */
    val canResend: Boolean
        get() = !isResending && !resendConfirmed

    /** Whether the "Code renvoyé !" confirmation should render (iOS `resendSuccess`). */
    val showResendConfirmation: Boolean
        get() = resendConfirmed

    /**
     * Whether verification can be submitted — inverse of iOS
     * `.disabled(!isCodeComplete || isVerifying || verificationSuccess)`: the code is
     * complete, no verify is in flight, and it has not already succeeded.
     */
    fun canVerify(code: String): Boolean =
        OtpCodeField.isComplete(code) && !isVerifying && !verified
}

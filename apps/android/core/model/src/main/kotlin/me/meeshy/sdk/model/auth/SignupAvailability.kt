package me.meeshy.sdk.model.auth

/**
 * Pure local-validation predicates + normalization for the signup wizard's
 * username / email / phone fields.
 *
 * Faithful port of iOS `RegistrationViewModel` (`isUsernameValidLocally`,
 * `isEmailValidLocally`, the phone `digits.count >= 8` guard, and the
 * trim/lowercase normalization the availability calls apply)
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`).
 *
 * SOTA note: iOS buries these predicates as `private func`s inside the stateful
 * view model. Android lifts them into a pure, framework-free SSOT object so the
 * gate is reusable by any onboarding surface and every branch is JVM-testable.
 */
object SignupFieldValidation {

    /** Inclusive minimum trimmed username length (iOS `trimmed.count >= 2`). */
    const val USERNAME_MIN_LENGTH: Int = 2

    /** Inclusive maximum trimmed username length (iOS `trimmed.count <= 16`). */
    const val USERNAME_MAX_LENGTH: Int = 16

    /** Minimum phone digit count before an availability probe (iOS `digits.count >= 8`). */
    const val PHONE_MIN_DIGITS: Int = 8

    private val usernameExtraAllowed: Set<Char> = setOf('_', '-')

    /** Whitespace-trimmed username, preserving case (the wire value iOS checks). */
    fun normalizedUsername(value: String): String = value.trim()

    /** Whitespace-trimmed, lower-cased email (iOS `.trimmed.lowercased()`). */
    fun normalizedEmail(value: String): String = value.trim().lowercase()

    /** Just the decimal digits of a raw phone entry (iOS `value.filter { $0.isNumber }`). */
    fun phoneDigits(value: String): String = value.filter { it.isDigit() }

    /**
     * True when the trimmed username is 2..16 chars and every character is a
     * letter, a digit, or one of `_ -` (iOS `CharacterSet.alphanumerics ∪ {_,-}`).
     */
    fun isUsernameValidLocally(value: String): Boolean {
        val trimmed = value.trim()
        if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) return false
        return trimmed.all { it.isLetterOrDigit() || it in usernameExtraAllowed }
    }

    /** True when the value contains both `@` and `.` (iOS's deliberately-loose gate). */
    fun isEmailValidLocally(value: String): Boolean =
        value.contains('@') && value.contains('.')

    /** True when the value carries at least [PHONE_MIN_DIGITS] digits. */
    fun isPhoneValidLocally(value: String): Boolean =
        phoneDigits(value).length >= PHONE_MIN_DIGITS
}

/**
 * The action a debounced field emission resolves to, mirroring the body of each
 * iOS `.debounce(1s).removeDuplicates().sink { … }` chain (the 1 s delay and the
 * duplicate suppression live in the reactive operator; this models the pure
 * decision the sink makes once a fresh value arrives).
 */
sealed interface AvailabilityIntent {

    /** Raw value equals the last emitted one — `removeDuplicates` suppresses it. */
    data object Unchanged : AvailabilityIntent

    /** Locally invalid — clear any availability state, do NOT hit the network. */
    data object Clear : AvailabilityIntent

    /** Locally valid — probe availability of [query] (already normalized). */
    data class Check(val query: String) : AvailabilityIntent
}

/**
 * Pure policy translating a debounced field value (plus the previously-emitted
 * raw value) into an [AvailabilityIntent], and answering the wizard's per-step
 * proceed gate.
 *
 * Parity: the three debounce sinks and the `.pseudo` / `.phone` / `.email` arms
 * of iOS `RegistrationViewModel.canProceed`. Dedup is checked first (it precedes
 * the local-validity guard in the Combine chain), so an unchanged value never
 * re-probes even when it is valid.
 */
object SignupAvailabilityPolicy {

    fun usernameIntent(current: String, previous: String?): AvailabilityIntent =
        intent(
            current = current,
            previous = previous,
            isValid = SignupFieldValidation::isUsernameValidLocally,
            normalize = SignupFieldValidation::normalizedUsername,
        )

    fun emailIntent(current: String, previous: String?): AvailabilityIntent =
        intent(
            current = current,
            previous = previous,
            isValid = SignupFieldValidation::isEmailValidLocally,
            normalize = SignupFieldValidation::normalizedEmail,
        )

    fun phoneIntent(current: String, previous: String?): AvailabilityIntent =
        intent(
            current = current,
            previous = previous,
            isValid = SignupFieldValidation::isPhoneValidLocally,
            normalize = SignupFieldValidation::phoneDigits,
        )

    /** iOS `.pseudo`: locally valid AND the server confirmed the handle is free. */
    fun usernameStepCanProceed(username: String, usernameAvailable: Boolean?): Boolean =
        SignupFieldValidation.isUsernameValidLocally(username) && usernameAvailable == true

    /** iOS `.email`: locally valid AND the server confirmed the address is free. */
    fun emailStepCanProceed(email: String, emailAvailable: Boolean?): Boolean =
        SignupFieldValidation.isEmailValidLocally(email) && emailAvailable == true

    /** iOS `.phone`: skipped, or enough digits AND the server confirmed it is free. */
    fun phoneStepCanProceed(phoneNumber: String, phoneAvailable: Boolean?, skipPhone: Boolean): Boolean =
        skipPhone || (SignupFieldValidation.isPhoneValidLocally(phoneNumber) && phoneAvailable == true)

    private inline fun intent(
        current: String,
        previous: String?,
        isValid: (String) -> Boolean,
        normalize: (String) -> String,
    ): AvailabilityIntent = when {
        previous != null && current == previous -> AvailabilityIntent.Unchanged
        !isValid(current) -> AvailabilityIntent.Clear
        else -> AvailabilityIntent.Check(normalize(current))
    }
}

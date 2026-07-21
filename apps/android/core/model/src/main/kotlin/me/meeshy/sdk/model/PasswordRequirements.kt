package me.meeshy.sdk.model

/**
 * Pure model of the iOS registration Step 5 password requirements checklist
 * (`OnboardingStepViews.StepPasswordView.requirementsCard`) — feature-parity §A
 * "First/last name capture; password strength meter + requirements checklist".
 *
 * The card renders four independent `reqRow`s, each a met / unmet check-circle:
 *  - [LENGTH]    — at least 8 characters (`password.count >= 8`)
 *  - [UPPERCASE] — contains an uppercase letter (`contains { isUppercase }`)
 *  - [LOWERCASE] — contains a lowercase letter (`contains { isLowercase }`)
 *  - [DIGIT]     — contains a digit (`contains { isNumber }`)
 *
 * This is intentionally distinct from [PasswordStrength]: the strength meter is a
 * 0..5 score with two length gates and a special-character band, while the
 * checklist is the four discrete "have you satisfied this rule" rows. Kept off
 * every Composable so every row boundary is behavioural-test-covered.
 */
enum class PasswordRequirement {
    LENGTH,
    UPPERCASE,
    LOWERCASE,
    DIGIT,
}

/**
 * The evaluated state of the four checklist rows for a given password. [met]
 * preserves card render order; [allMet] is the "all four green" summary the
 * caller uses to tint the shield header.
 */
data class PasswordRequirementsState(
    val length: Boolean,
    val uppercase: Boolean,
    val lowercase: Boolean,
    val digit: Boolean,
) {
    fun isMet(requirement: PasswordRequirement): Boolean = when (requirement) {
        PasswordRequirement.LENGTH -> length
        PasswordRequirement.UPPERCASE -> uppercase
        PasswordRequirement.LOWERCASE -> lowercase
        PasswordRequirement.DIGIT -> digit
    }

    val met: List<PasswordRequirement> = PasswordRequirement.entries.filter(::isMet)

    val allMet: Boolean = length && uppercase && lowercase && digit
}

object PasswordRequirements {
    /** The length gate the checklist and the confirm-field reveal share. */
    const val MIN_LENGTH: Int = 8

    fun evaluate(password: String): PasswordRequirementsState = PasswordRequirementsState(
        length = password.length >= MIN_LENGTH,
        uppercase = password.any { it.isUpperCase() },
        lowercase = password.any { it.isLowerCase() },
        digit = password.any { it.isDigit() },
    )
}

package me.meeshy.sdk.model

/**
 * Pure password-strength scoring for the change-password (and future register)
 * surfaces — feature-parity §L "Change password with strength meter + validation".
 *
 * Port of iOS `PasswordStrengthIndicator.strength` (MeeshyUI). The score is the
 * count of satisfied heuristics, capped at 5 — exactly the number of filled bars
 * the meter renders:
 *  - length ≥ 8                     (+1)
 *  - length ≥ 12                    (+1)
 *  - contains an uppercase letter   (+1)
 *  - contains a lowercase letter    (+1)
 *  - contains a digit               (+1)
 *  - contains a shared symbol       (+1)
 *
 * Kept off every Composable so each band boundary is behavioural-test-covered.
 */
enum class PasswordStrengthLevel(val score: Int) {
    TOO_WEAK(0),
    WEAK(1),
    MEDIUM(2),
    GOOD(3),
    STRONG(4),
    EXCELLENT(5),
}

object PasswordStrength {
    /** The number of bars the meter renders — the maximum score. */
    const val MAX_SCORE: Int = 5

    /** The special characters that count toward the score — mirrors iOS verbatim. */
    private const val SPECIAL_CHARACTERS = "!@#$%^&*()_+-=[]{}|;:,.<>?"

    /**
     * Scores [password] into one of the six [PasswordStrengthLevel] bands. An empty
     * password scores [PasswordStrengthLevel.TOO_WEAK] (0 filled bars); the caller
     * decides whether to surface the label (iOS hides it while the field is empty).
     */
    fun evaluate(password: String): PasswordStrengthLevel {
        var score = 0
        if (password.length >= 8) score++
        if (password.length >= 12) score++
        if (password.any { it.isUpperCase() }) score++
        if (password.any { it.isLowerCase() }) score++
        if (password.any { it.isDigit() }) score++
        if (password.any { it in SPECIAL_CHARACTERS }) score++
        val capped = score.coerceAtMost(MAX_SCORE)
        return PasswordStrengthLevel.entries.first { it.score == capped }
    }
}

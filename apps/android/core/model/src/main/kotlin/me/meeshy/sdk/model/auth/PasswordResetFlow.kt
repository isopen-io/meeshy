package me.meeshy.sdk.model.auth

/**
 * Ce que la passerelle a répondu à `POST /auth/reset-password` — miroir de `PasswordResetOutcome` (iOS, SDK) et de
 * `resolveResetPasswordOutcome` (web). Le `code` d'abord ; le texte historique, que la passerelle sert inchangé, en
 * repli pour une passerelle plus ancienne que l'app. Jamais de présomption sur l'existence d'un compte : tous les
 * refus de jeton se confondent en [InvalidToken].
 */
sealed interface PasswordResetOutcome {
    data object Saved : PasswordResetOutcome
    data object InvalidToken : PasswordResetOutcome
    data object AttemptsExhausted : PasswordResetOutcome
    data object WeakPassword : PasswordResetOutcome
    data object ReusedPassword : PasswordResetOutcome
    data object SecondFactorRequired : PasswordResetOutcome
    data object SecondFactorInvalid : PasswordResetOutcome
    data object AccountLocked : PasswordResetOutcome
    data object RateLimited : PasswordResetOutcome
    data object Offline : PasswordResetOutcome
    data class Failed(val reference: String) : PasswordResetOutcome

    companion object {
        private const val NETWORK_CODE = "NETWORK"

        private class Refusal(val code: String, val text: String, val isPrefix: Boolean, val outcome: PasswordResetOutcome) {
            fun matches(lowered: String): Boolean = if (isPrefix) lowered.startsWith(text) else lowered.contains(text)
        }

        private val refusals = listOf(
            Refusal("RESET_TOKEN_INVALID", "invalid or expired reset token", false, InvalidToken),
            Refusal("TWO_FACTOR_ATTEMPTS_EXHAUSTED", "too many invalid 2fa codes", false, AttemptsExhausted),
            Refusal("RESET_PASSWORD_WEAK", "password requirements", true, WeakPassword),
            Refusal("RESET_PASSWORD_REUSED", "password was used recently", false, ReusedPassword),
            Refusal("TWO_FACTOR_REQUIRED", "2fa code required", false, SecondFactorRequired),
            Refusal("TWO_FACTOR_INVALID", "invalid 2fa code", false, SecondFactorInvalid),
            Refusal("ACCOUNT_LOCKED", "account is locked", false, AccountLocked),
        )

        /** Lit un échec de transport ou un refus : [httpStatus] `null` hors réponse HTTP, [code] et [message] tels que servis. */
        fun of(httpStatus: Int?, code: String?, message: String): PasswordResetOutcome = when {
            code == NETWORK_CODE -> Offline
            httpStatus == 429 -> RateLimited
            httpStatus == 400 -> refusal(code, message) ?: Failed(code ?: "400")
            else -> Failed(code ?: httpStatus?.toString() ?: "0")
        }

        private fun refusal(code: String?, text: String): PasswordResetOutcome? {
            refusals.firstOrNull { it.code == code }?.let { return it.outcome }
            val lowered = text.lowercase()
            return refusals.firstOrNull { it.matches(lowered) }?.outcome
        }
    }
}

/**
 * L'écran « Nouveau mot de passe » réduit à des valeurs — miroir de `PasswordResetFlow` (iOS). Chaque transition
 * rend une copie ; rien n'est caché dans l'écran.
 */
data class PasswordResetFlow(
    val phase: Phase = Phase.FORM,
    val requiresSecondFactor: Boolean = false,
    val notice: Notice? = null,
) {
    enum class Phase { FORM, SAVED, LINK_INVALID, ATTEMPTS_EXHAUSTED }

    sealed interface Notice {
        data object SecondFactorRequired : Notice
        data object SecondFactorInvalid : Notice
        data object WeakPassword : Notice
        data object ReusedPassword : Notice
        data object AccountLocked : Notice
        data object RateLimited : Notice
        data object Offline : Notice
        data class Failed(val reference: String) : Notice
    }

    fun verified(verification: ResetTokenVerification): PasswordResetFlow =
        if (!verification.valid) {
            PasswordResetFlow(phase = Phase.LINK_INVALID, requiresSecondFactor = requiresSecondFactor)
        } else {
            copy(requiresSecondFactor = requiresSecondFactor || verification.requires2FA)
        }

    fun resolved(outcome: PasswordResetOutcome): PasswordResetFlow = when (outcome) {
        PasswordResetOutcome.Saved -> PasswordResetFlow(Phase.SAVED, requiresSecondFactor)
        PasswordResetOutcome.InvalidToken -> PasswordResetFlow(Phase.LINK_INVALID, requiresSecondFactor)
        PasswordResetOutcome.AttemptsExhausted -> PasswordResetFlow(Phase.ATTEMPTS_EXHAUSTED, requiresSecondFactor)
        PasswordResetOutcome.SecondFactorRequired -> PasswordResetFlow(requiresSecondFactor = true, notice = Notice.SecondFactorRequired)
        PasswordResetOutcome.SecondFactorInvalid -> refused(Notice.SecondFactorInvalid)
        PasswordResetOutcome.WeakPassword -> refused(Notice.WeakPassword)
        PasswordResetOutcome.ReusedPassword -> refused(Notice.ReusedPassword)
        PasswordResetOutcome.AccountLocked -> refused(Notice.AccountLocked)
        PasswordResetOutcome.RateLimited -> refused(Notice.RateLimited)
        PasswordResetOutcome.Offline -> refused(Notice.Offline)
        is PasswordResetOutcome.Failed -> refused(Notice.Failed(outcome.reference))
    }

    fun clearingNotice(): PasswordResetFlow = copy(notice = null)

    fun canSubmit(newPassword: String, confirmPassword: String, code: String): Boolean {
        if (newPassword.isEmpty() || newPassword != confirmPassword) return false
        return !requiresSecondFactor || sanitizedCode(code).length == CODE_LENGTH
    }

    /** Le code à transmettre — `null` tant que le compte ne l'exige pas. */
    fun submittedCode(code: String): String? = if (requiresSecondFactor) sanitizedCode(code) else null

    private fun refused(notice: Notice) = PasswordResetFlow(Phase.FORM, requiresSecondFactor, notice)

    companion object {
        const val CODE_LENGTH = 6

        fun sanitizedCode(raw: String): String = raw.filter { it in '0'..'9' }.take(CODE_LENGTH)
    }
}

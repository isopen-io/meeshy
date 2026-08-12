package me.meeshy.sdk.model

/**
 * The state of the confirm-password interaction on iOS registration Step 5
 * (`StepPasswordView` + `RegistrationViewModel.canProceed`), lifted out of the
 * View so its three gates are behavioural-test-covered.
 *
 * Parity, verbatim from iOS:
 *  - confirm field appears once `password.count >= 8` ([showConfirmField]);
 *  - the inline card shows a match verdict only with a non-empty confirm and a
 *    visible field (`!confirmPassword.isEmpty && password == confirmPassword`);
 *  - the step advances only when `password.count >= 8 && password == confirm`
 *    ([canProceed]).
 */
enum class PasswordMatch {
    /** No verdict surfaced yet (confirm empty, or the field is still hidden). */
    UNDETERMINED,
    MATCHED,
    MISMATCHED,
}

data class PasswordEntryState(
    val showConfirmField: Boolean,
    val match: PasswordMatch,
    val canProceed: Boolean,
) {
    val isMatched: Boolean = match == PasswordMatch.MATCHED
}

object PasswordEntry {
    fun evaluate(password: String, confirm: String): PasswordEntryState {
        val showConfirmField = password.length >= PasswordRequirements.MIN_LENGTH
        val match = when {
            !showConfirmField || confirm.isEmpty() -> PasswordMatch.UNDETERMINED
            password == confirm -> PasswordMatch.MATCHED
            else -> PasswordMatch.MISMATCHED
        }
        return PasswordEntryState(
            showConfirmField = showConfirmField,
            match = match,
            canProceed = showConfirmField && password == confirm,
        )
    }
}

package me.meeshy.sdk.model

/**
 * Pure validation for the change-password form — feature-parity §L. Port of iOS
 * `ChangePasswordView.isValid` / `passwordsMatch`, hardened with one SOTA gate iOS
 * lacks: the new password must differ from the current one (a no-op change is
 * pointless, and a dedicated hint tells the user why the button stays disabled).
 *
 * Every gate is surfaced individually so the screen can render per-rule hint rows;
 * [canSubmit] is the single verdict the submit button reads.
 */
data class ChangePasswordValidation(
    val isCurrentPresent: Boolean,
    val isNewLongEnough: Boolean,
    val passwordsMatch: Boolean,
    val isNewDifferent: Boolean,
) {
    val canSubmit: Boolean
        get() = isCurrentPresent && isNewLongEnough && passwordsMatch && isNewDifferent

    companion object {
        /** Minimum new-password length — matches the gateway `newPassword` minLength. */
        const val MIN_LENGTH: Int = 8
    }
}

object ChangePasswordForm {
    /**
     * Validates the three editor buffers. The passwords-match gate requires a
     * non-empty new password (an empty pair is not "matching"); the differ gate is
     * inert while the new field is empty (the length gate already blocks submit)
     * so the "must differ" hint never fires prematurely on an empty field.
     */
    fun validate(
        currentPassword: String,
        newPassword: String,
        confirmPassword: String,
    ): ChangePasswordValidation =
        ChangePasswordValidation(
            isCurrentPresent = currentPassword.isNotEmpty(),
            isNewLongEnough = newPassword.length >= ChangePasswordValidation.MIN_LENGTH,
            passwordsMatch = newPassword.isNotEmpty() && newPassword == confirmPassword,
            isNewDifferent = newPassword.isEmpty() || newPassword != currentPassword,
        )
}

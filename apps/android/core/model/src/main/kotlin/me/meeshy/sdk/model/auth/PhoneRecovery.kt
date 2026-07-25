package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.PasswordEntry

/**
 * The server-masked account preview returned by the phone lookup step — the three
 * fields iOS renders inside the "Compte trouvé" card
 * (`res.data.maskedUserInfo.{displayName,username,email}` in
 * `MeeshyForgotPasswordView.phoneLookup`). Masking happens server-side; this type
 * carries the already-masked strings verbatim.
 */
data class MaskedUserInfo(
    val displayName: String,
    val username: String,
    val email: String,
)

/**
 * The progressive steps of phone-based password recovery, plus the terminal
 * [SUCCESS]. Mirrors iOS `PhoneStep` (`lookup`/`verifyIdentity`/`verifyCode`) with
 * the reset sheet and its success screen folded in as [RESET] / [SUCCESS] so the
 * whole flow lives in one machine.
 */
enum class PhoneRecoveryStep { LOOKUP, VERIFY_IDENTITY, VERIFY_CODE, RESET, SUCCESS }

/**
 * Immutable state machine for phone-based recovery. Faithful port of the flow iOS
 * scatters across `@State` on `MeeshyForgotPasswordView`, with the network
 * side-effects kept app-side and only the pure step/data transitions modelled here.
 *
 * SOTA hardening over iOS: every transition is **guarded** on the current step, so
 * a late or out-of-order network response can neither skip a step nor rewind an
 * advanced flow (iOS advances `phoneStep` unconditionally inside each async
 * handler). An off-step event returns the receiver unchanged.
 *
 * @property step the current recovery step (starts at [PhoneRecoveryStep.LOOKUP]).
 * @property maskedInfo the masked account preview, set once the lookup succeeds.
 * @property resetToken the opaque reset token, threaded from the verify-code step
 *   into the reset call (iOS `@State resetToken`).
 */
data class PhoneRecoveryState(
    val step: PhoneRecoveryStep = PhoneRecoveryStep.LOOKUP,
    val maskedInfo: MaskedUserInfo? = null,
    val resetToken: String? = null,
) {

    /**
     * Lookup succeeded ([PhoneRecoveryStep.LOOKUP] → [PhoneRecoveryStep.VERIFY_IDENTITY]),
     * carrying the masked account preview. Ignored off-step.
     */
    fun onLookupSuccess(info: MaskedUserInfo): PhoneRecoveryState =
        if (step == PhoneRecoveryStep.LOOKUP) {
            copy(step = PhoneRecoveryStep.VERIFY_IDENTITY, maskedInfo = info)
        } else {
            this
        }

    /**
     * Identity confirmed and SMS code sent
     * ([PhoneRecoveryStep.VERIFY_IDENTITY] → [PhoneRecoveryStep.VERIFY_CODE]).
     * Ignored off-step.
     */
    fun onIdentityVerified(): PhoneRecoveryState =
        if (step == PhoneRecoveryStep.VERIFY_IDENTITY) {
            copy(step = PhoneRecoveryStep.VERIFY_CODE)
        } else {
            this
        }

    /**
     * SMS code accepted ([PhoneRecoveryStep.VERIFY_CODE] → [PhoneRecoveryStep.RESET]),
     * threading the [resetToken] the server returned. Ignored off-step, so a stale
     * response never leaks a token onto an earlier step.
     */
    fun onCodeVerified(resetToken: String): PhoneRecoveryState =
        if (step == PhoneRecoveryStep.VERIFY_CODE) {
            copy(step = PhoneRecoveryStep.RESET, resetToken = resetToken)
        } else {
            this
        }

    /**
     * Password reset succeeded ([PhoneRecoveryStep.RESET] → [PhoneRecoveryStep.SUCCESS]).
     * Ignored off-step.
     */
    fun onResetSuccess(): PhoneRecoveryState =
        if (step == PhoneRecoveryStep.RESET) {
            copy(step = PhoneRecoveryStep.SUCCESS)
        } else {
            this
        }

    companion object {
        /** The flow's entry state (iOS `phoneStep = .lookup`, no info, no token). */
        val INITIAL: PhoneRecoveryState = PhoneRecoveryState()
    }
}

/**
 * Per-step input gates for phone recovery. iOS disables each action button on
 * nothing but `isLoading`; Android adds a local-validity gate per step (the same
 * SOTA hardening applied to change-password), each delegating to an existing SSOT
 * so no validation rule is re-implemented or allowed to drift.
 */
object PhoneRecoveryInput {

    /** The phone entry carries enough digits to look up (iOS `digits.count >= 8`). */
    fun canLookup(phoneNumber: String): Boolean =
        SignupFieldValidation.isPhoneValidLocally(phoneNumber)

    /**
     * The identity challenge is answerable: a non-blank full username and a
     * plausible full email (the wizard's loose `@`+`.` gate — this is a challenge
     * answer, not a new address, so the strict magic-link shape is not required).
     */
    fun canVerifyIdentity(fullUsername: String, fullEmail: String): Boolean =
        fullUsername.isNotBlank() && SignupFieldValidation.isEmailValidLocally(fullEmail)

    /** The SMS code is a full 6-digit value (iOS `code.count == 6`). */
    fun canSubmitCode(code: String): Boolean =
        OtpCodeField.isComplete(code)

    /**
     * The new password satisfies the app's length rule and matches its confirmation
     * (delegates to [PasswordEntry], the SSOT shared with registration and
     * change-password). Stricter than iOS, whose `doResetPassword` guards equality
     * only and leaves length to the server.
     */
    fun canReset(newPassword: String, confirm: String): Boolean =
        PasswordEntry.evaluate(newPassword, confirm).canProceed

    /**
     * Whether the inline "passwords do not match" text should render — a verbatim
     * port of iOS's `newPassword != confirmPassword && !confirmPassword.isEmpty`,
     * which (unlike [canReset]) is ungated on length so the mismatch is flagged as
     * soon as the user types a diverging confirmation.
     */
    fun showMismatch(newPassword: String, confirm: String): Boolean =
        confirm.isNotEmpty() && newPassword != confirm
}

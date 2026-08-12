package me.meeshy.sdk.model.auth

/**
 * The two visual states of email-link password recovery, mirroring iOS's
 * `@State emailSent` boolean in `MeeshyForgotPasswordView.emailFlow`
 * (`false` → the address field, `true` → the "link sent" confirmation).
 */
enum class EmailRecoveryStep { INPUT, SENT }

/**
 * Immutable state machine for email-link password recovery. Faithful port of the
 * flow iOS scatters across `@State email` / `@State emailSent` on
 * `MeeshyForgotPasswordView`, with the network side-effect
 * (`authManager.requestPasswordReset(email:)`) kept app-side and only the pure
 * step/data transition modelled here.
 *
 * SOTA hardening over iOS:
 * - the single transition is **guarded** on the current step, so a late or
 *   duplicate success can neither reopen nor overwrite an already-confirmed flow
 *   (iOS flips `emailSent = true` unconditionally on every successful request);
 * - the submitted address is **snapshotted** into [submittedEmail], so the
 *   confirmation screen quotes a stable value even if the field is later edited or
 *   cleared (iOS interpolates the *live* `email` field into its confirmation text).
 *
 * @property step the current recovery step (starts at [EmailRecoveryStep.INPUT]).
 * @property submittedEmail the exact address that was submitted, captured verbatim
 *   once the reset link is requested (iOS quotes it in "Si un compte existe avec
 *   {email}…"); `null` until then.
 */
data class EmailRecoveryState(
    val step: EmailRecoveryStep = EmailRecoveryStep.INPUT,
    val submittedEmail: String? = null,
) {

    /**
     * The reset-link request succeeded
     * ([EmailRecoveryStep.INPUT] → [EmailRecoveryStep.SENT]), snapshotting the
     * submitted [email] verbatim. Ignored off-step, so a late or duplicate success
     * neither reopens the flow nor overwrites the first captured address.
     */
    fun onSent(email: String): EmailRecoveryState =
        if (step == EmailRecoveryStep.INPUT) {
            copy(step = EmailRecoveryStep.SENT, submittedEmail = email)
        } else {
            this
        }

    companion object {
        /** The flow's entry state (iOS `emailSent = false`, no captured address). */
        val INITIAL: EmailRecoveryState = EmailRecoveryState()
    }
}

/**
 * Input gate for email recovery. iOS disables the Send button on nothing but
 * `isLoading`; Android adds a local-validity gate delegating to the existing
 * [SignupFieldValidation] SSOT so the loose `@`+`.` rule is not re-implemented or
 * allowed to drift from the rest of auth.
 */
object EmailRecoveryInput {

    /** The entry carries a plausibly-shaped address (the loose `@`+`.` gate). */
    fun canSend(email: String): Boolean =
        SignupFieldValidation.isEmailValidLocally(email)
}

package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure email-link password-recovery core
 * ([EmailRecoveryState] + [EmailRecoveryInput]) backing the "recover by email"
 * flow: enter email → request a reset link → confirmation screen.
 *
 * Parity source: iOS `MeeshyForgotPasswordView.emailFlow`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift`) — the
 * `@State email` / `@State emailSent` pair driven by `authManager.requestPasswordReset(email:)`.
 * iOS renders the field while `!emailSent`, then a "Si un compte existe avec {email},
 * un lien de réinitialisation a été envoyé." confirmation once it flips `true`.
 *
 * SOTA note: iOS scatters the two-state flow as `@State` on the View, flips
 * `emailSent` unconditionally on a successful request, quotes the *live* field in
 * the confirmation text, and gates the Send button on nothing but `isLoading`.
 * Android lifts it into one immutable machine that (1) **guards** the single
 * transition so a late/duplicate success can neither reopen nor overwrite the
 * confirmed flow, (2) **snapshots** the submitted address into state so the
 * confirmation is immune to later field edits, and (3) adds a local email-validity
 * **gate** iOS lacks, delegating to the existing [SignupFieldValidation] SSOT so no
 * rule is re-implemented.
 *
 * Every assertion is on observable behaviour through the public API. Expectations
 * are hand-written literals, independent of how production derives them.
 */
class EmailRecoveryTest {

    // --- initial state ---

    @Test
    fun initial_startsAtInputWithNoSubmittedEmail() {
        val state = EmailRecoveryState.INITIAL
        assertThat(state.step).isEqualTo(EmailRecoveryStep.INPUT)
        assertThat(state.submittedEmail).isNull()
    }

    // --- onSent (the single transition) ---

    @Test
    fun onSent_fromInput_advancesToSentCapturingTheSubmittedEmail() {
        val next = EmailRecoveryState.INITIAL.onSent("alice@example.com")
        assertThat(next.step).isEqualTo(EmailRecoveryStep.SENT)
        assertThat(next.submittedEmail).isEqualTo("alice@example.com")
    }

    @Test
    fun onSent_capturesTheAddressVerbatim_preservingCaseAndSpacing() {
        val next = EmailRecoveryState.INITIAL.onSent("  Alice.D@Example.COM ")
        assertThat(next.submittedEmail).isEqualTo("  Alice.D@Example.COM ")
    }

    @Test
    fun onSent_fromSent_isInert_andDoesNotOverwriteTheCapturedEmail() {
        val sent = EmailRecoveryState.INITIAL.onSent("first@example.com")
        val again = sent.onSent("second@example.com")
        assertThat(again.step).isEqualTo(EmailRecoveryStep.SENT)
        assertThat(again.submittedEmail).isEqualTo("first@example.com")
    }

    @Test
    fun onSent_fromSent_returnsAnEquivalentStateUnchanged() {
        val sent = EmailRecoveryState.INITIAL.onSent("first@example.com")
        assertThat(sent.onSent("second@example.com")).isEqualTo(sent)
    }

    // --- EmailRecoveryInput.canSend gate ---

    @Test
    fun canSend_isTrueForAnAddressCarryingBothAtAndDot() {
        assertThat(EmailRecoveryInput.canSend("bob@meeshy.me")).isTrue()
    }

    @Test
    fun canSend_isFalseWhenTheAtSignIsMissing() {
        assertThat(EmailRecoveryInput.canSend("bob.meeshy.me")).isFalse()
    }

    @Test
    fun canSend_isFalseWhenTheDotIsMissing() {
        assertThat(EmailRecoveryInput.canSend("bob@meeshy")).isFalse()
    }

    @Test
    fun canSend_isFalseForABlankEntry() {
        assertThat(EmailRecoveryInput.canSend("")).isFalse()
        assertThat(EmailRecoveryInput.canSend("   ")).isFalse()
    }
}

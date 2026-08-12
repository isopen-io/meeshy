package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure phone-based password-recovery core
 * ([PhoneRecoveryState] + [PhoneRecoveryInput]) backing the "recover by phone"
 * flow: lookup → verify identity → verify SMS code → reset password.
 *
 * Parity source: iOS `MeeshyForgotPasswordView`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/MeeshyForgotPasswordView.swift`) —
 * the `PhoneStep` enum (`lookup`/`verifyIdentity`/`verifyCode`) driven by
 * `phoneLookup` (POST `/auth/forgot-password/phone/lookup` → `tokenId` +
 * `maskedUserInfo{displayName,username,email}`), `phoneVerifyIdentity` (POST
 * `.../verify-identity` {tokenId, fullUsername, fullEmail} → `codeSent`),
 * `phoneVerifyCode` (POST `.../verify-code` {tokenId, code} → `resetToken`) then
 * the reset sheet (`newPassword`/`confirmPassword`, POST `/auth/reset-password`).
 *
 * SOTA note: iOS scatters the flow as `@State` on the View, advancing steps
 * unconditionally inside each async handler and gating the action buttons on
 * nothing but `isLoading`. Android lifts the whole flow into one immutable state
 * machine with **guarded** transitions (a stale/out-of-order response can never
 * skip or rewind a step) and adds per-step **input gates** iOS lacks, all built
 * on the existing SSOTs ([SignupFieldValidation], [OtpCodeField],
 * [me.meeshy.sdk.model.PasswordEntry]) so nothing drifts.
 *
 * Every assertion is on observable behaviour through the public API. Expectations
 * are hand-written literals, independent of how production derives them.
 */
class PhoneRecoveryTest {

    private val maskedInfo = MaskedUserInfo(
        displayName = "J*** D**",
        username = "j***e",
        email = "j***e@e***.com",
    )

    // --- initial state ---

    @Test
    fun initial_startsAtLookupWithNoInfoOrToken() {
        val state = PhoneRecoveryState.INITIAL
        assertThat(state.step).isEqualTo(PhoneRecoveryStep.LOOKUP)
        assertThat(state.maskedInfo).isNull()
        assertThat(state.resetToken).isNull()
    }

    // --- onLookupSuccess ---

    @Test
    fun onLookupSuccess_fromLookup_advancesToVerifyIdentityCarryingMaskedInfo() {
        val next = PhoneRecoveryState.INITIAL.onLookupSuccess(maskedInfo)
        assertThat(next.step).isEqualTo(PhoneRecoveryStep.VERIFY_IDENTITY)
        assertThat(next.maskedInfo).isEqualTo(maskedInfo)
    }

    @Test
    fun onLookupSuccess_fromLaterStep_isIgnored_staleResponseCannotRewind() {
        val atCode = PhoneRecoveryState(step = PhoneRecoveryStep.VERIFY_CODE, maskedInfo = maskedInfo)
        val other = MaskedUserInfo("X", "x", "x@x.com")
        val next = atCode.onLookupSuccess(other)
        assertThat(next).isEqualTo(atCode)
    }

    @Test
    fun onLookupSuccess_doesNotMutateReceiver() {
        val start = PhoneRecoveryState.INITIAL
        start.onLookupSuccess(maskedInfo)
        assertThat(start.step).isEqualTo(PhoneRecoveryStep.LOOKUP)
        assertThat(start.maskedInfo).isNull()
    }

    // --- onIdentityVerified ---

    @Test
    fun onIdentityVerified_fromVerifyIdentity_advancesToVerifyCode() {
        val atIdentity = PhoneRecoveryState(step = PhoneRecoveryStep.VERIFY_IDENTITY, maskedInfo = maskedInfo)
        val next = atIdentity.onIdentityVerified()
        assertThat(next.step).isEqualTo(PhoneRecoveryStep.VERIFY_CODE)
        assertThat(next.maskedInfo).isEqualTo(maskedInfo)
    }

    @Test
    fun onIdentityVerified_fromLookup_isIgnored() {
        val next = PhoneRecoveryState.INITIAL.onIdentityVerified()
        assertThat(next).isEqualTo(PhoneRecoveryState.INITIAL)
    }

    // --- onCodeVerified ---

    @Test
    fun onCodeVerified_fromVerifyCode_advancesToResetCarryingToken() {
        val atCode = PhoneRecoveryState(step = PhoneRecoveryStep.VERIFY_CODE, maskedInfo = maskedInfo)
        val next = atCode.onCodeVerified("reset-tok-123")
        assertThat(next.step).isEqualTo(PhoneRecoveryStep.RESET)
        assertThat(next.resetToken).isEqualTo("reset-tok-123")
    }

    @Test
    fun onCodeVerified_fromVerifyIdentity_isIgnored_andDoesNotLeakToken() {
        val atIdentity = PhoneRecoveryState(step = PhoneRecoveryStep.VERIFY_IDENTITY, maskedInfo = maskedInfo)
        val next = atIdentity.onCodeVerified("reset-tok-123")
        assertThat(next).isEqualTo(atIdentity)
        assertThat(next.resetToken).isNull()
    }

    // --- onResetSuccess ---

    @Test
    fun onResetSuccess_fromReset_advancesToSuccess() {
        val atReset = PhoneRecoveryState(step = PhoneRecoveryStep.RESET, resetToken = "tok")
        val next = atReset.onResetSuccess()
        assertThat(next.step).isEqualTo(PhoneRecoveryStep.SUCCESS)
    }

    @Test
    fun onResetSuccess_fromLookup_isIgnored() {
        val next = PhoneRecoveryState.INITIAL.onResetSuccess()
        assertThat(next.step).isEqualTo(PhoneRecoveryStep.LOOKUP)
    }

    // --- full happy path ---

    @Test
    fun happyPath_lookupToSuccess_preservesInfoAndToken() {
        val end = PhoneRecoveryState.INITIAL
            .onLookupSuccess(maskedInfo)
            .onIdentityVerified()
            .onCodeVerified("final-token")
            .onResetSuccess()
        assertThat(end.step).isEqualTo(PhoneRecoveryStep.SUCCESS)
        assertThat(end.maskedInfo).isEqualTo(maskedInfo)
        assertThat(end.resetToken).isEqualTo("final-token")
    }

    // --- PhoneRecoveryInput.canLookup ---

    @Test
    fun canLookup_trueForEightOrMoreDigits() {
        assertThat(PhoneRecoveryInput.canLookup("612345678")).isTrue()
    }

    @Test
    fun canLookup_countsDigitsIgnoringFormatting() {
        assertThat(PhoneRecoveryInput.canLookup("06 12 34 56")).isTrue()
    }

    @Test
    fun canLookup_falseForTooFewDigits() {
        assertThat(PhoneRecoveryInput.canLookup("12 34")).isFalse()
    }

    @Test
    fun canLookup_falseForBlank() {
        assertThat(PhoneRecoveryInput.canLookup("   ")).isFalse()
    }

    // --- PhoneRecoveryInput.canVerifyIdentity ---

    @Test
    fun canVerifyIdentity_trueForUsernameAndPlausibleEmail() {
        assertThat(PhoneRecoveryInput.canVerifyIdentity("jane", "jane@example.com")).isTrue()
    }

    @Test
    fun canVerifyIdentity_falseForBlankUsername() {
        assertThat(PhoneRecoveryInput.canVerifyIdentity("   ", "jane@example.com")).isFalse()
    }

    @Test
    fun canVerifyIdentity_falseForEmailMissingAt() {
        assertThat(PhoneRecoveryInput.canVerifyIdentity("jane", "jane.example.com")).isFalse()
    }

    @Test
    fun canVerifyIdentity_falseForEmailMissingDot() {
        assertThat(PhoneRecoveryInput.canVerifyIdentity("jane", "jane@examplecom")).isFalse()
    }

    // --- PhoneRecoveryInput.canSubmitCode ---

    @Test
    fun canSubmitCode_trueForSixDigits() {
        assertThat(PhoneRecoveryInput.canSubmitCode("123456")).isTrue()
    }

    @Test
    fun canSubmitCode_falseForFiveDigits() {
        assertThat(PhoneRecoveryInput.canSubmitCode("12345")).isFalse()
    }

    @Test
    fun canSubmitCode_falseForNonDigits() {
        assertThat(PhoneRecoveryInput.canSubmitCode("12a456")).isFalse()
    }

    // --- PhoneRecoveryInput.canReset ---

    @Test
    fun canReset_trueForStrongMatchingPasswords() {
        assertThat(PhoneRecoveryInput.canReset("secret12", "secret12")).isTrue()
    }

    @Test
    fun canReset_falseForTooShortPassword() {
        assertThat(PhoneRecoveryInput.canReset("short", "short")).isFalse()
    }

    @Test
    fun canReset_falseForMismatch() {
        assertThat(PhoneRecoveryInput.canReset("secret12", "secret13")).isFalse()
    }

    // --- PhoneRecoveryInput.showMismatch (iOS inline red text) ---

    @Test
    fun showMismatch_falseWhenConfirmEmpty() {
        assertThat(PhoneRecoveryInput.showMismatch("secret12", "")).isFalse()
    }

    @Test
    fun showMismatch_falseWhenEqual() {
        assertThat(PhoneRecoveryInput.showMismatch("secret12", "secret12")).isFalse()
    }

    @Test
    fun showMismatch_trueWhenNonEmptyAndDiffering() {
        assertThat(PhoneRecoveryInput.showMismatch("secret12", "secret1")).isTrue()
    }

    @Test
    fun showMismatch_trueEvenForShortPasswords_ungatedOnLength() {
        assertThat(PhoneRecoveryInput.showMismatch("ab", "ac")).isTrue()
    }
}

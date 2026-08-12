package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [PasswordEntry.evaluate] — the pure state of iOS
 * registration Step 5 (`StepPasswordView` + `RegistrationViewModel.canProceed`).
 *
 * Parity rules pinned:
 *  - the confirm field only appears once the password reaches the length gate
 *    (`viewModel.password.count >= 8`);
 *  - the match card only appears with a non-empty confirm
 *    (`!confirmPassword.isEmpty && password == confirmPassword`);
 *  - the step advances only when `password.count >= 8 && password == confirmPassword`.
 */
class PasswordEntryTest {

    @Test
    fun evaluate_bothEmpty_hidesConfirmAndCannotProceed() {
        val state = PasswordEntry.evaluate(password = "", confirm = "")
        assertThat(state.showConfirmField).isFalse()
        assertThat(state.match).isEqualTo(PasswordMatch.UNDETERMINED)
        assertThat(state.canProceed).isFalse()
    }

    @Test
    fun evaluate_shortPassword_hidesConfirmField() {
        // 7 chars: below the length gate, so the confirm field stays hidden.
        val state = PasswordEntry.evaluate(password = "Abcdef1", confirm = "")
        assertThat(state.showConfirmField).isFalse()
        assertThat(state.canProceed).isFalse()
    }

    @Test
    fun evaluate_exactlyEightChars_revealsConfirmField() {
        // >= 8 is the boundary that reveals the confirm field.
        assertThat(PasswordEntry.evaluate("Abcdefg1", "").showConfirmField).isTrue()
        assertThat(PasswordEntry.evaluate("Abcdef1", "").showConfirmField).isFalse()
    }

    @Test
    fun evaluate_longPasswordEmptyConfirm_matchUndetermined() {
        // Confirm untouched → no match card yet, cannot proceed.
        val state = PasswordEntry.evaluate(password = "Abcdefg1", confirm = "")
        assertThat(state.showConfirmField).isTrue()
        assertThat(state.match).isEqualTo(PasswordMatch.UNDETERMINED)
        assertThat(state.canProceed).isFalse()
    }

    @Test
    fun evaluate_confirmMatches_matchedAndCanProceed() {
        val state = PasswordEntry.evaluate(password = "Abcdefg1", confirm = "Abcdefg1")
        assertThat(state.match).isEqualTo(PasswordMatch.MATCHED)
        assertThat(state.canProceed).isTrue()
    }

    @Test
    fun evaluate_confirmDiffers_mismatchedAndCannotProceed() {
        val state = PasswordEntry.evaluate(password = "Abcdefg1", confirm = "Abcdefg2")
        assertThat(state.match).isEqualTo(PasswordMatch.MISMATCHED)
        assertThat(state.canProceed).isFalse()
    }

    @Test
    fun evaluate_matchingButTooShort_cannotProceed() {
        // Identical but below the length gate: iOS gate is `count >= 8 && ==`.
        val state = PasswordEntry.evaluate(password = "Abc1", confirm = "Abc1")
        assertThat(state.showConfirmField).isFalse()
        // No visible confirm field, so no match card is surfaced.
        assertThat(state.match).isEqualTo(PasswordMatch.UNDETERMINED)
        assertThat(state.canProceed).isFalse()
    }

    @Test
    fun evaluate_confirmLongerButPasswordShort_noMatchCardNoProceed() {
        // Password below gate → confirm field hidden even if confirm has text.
        val state = PasswordEntry.evaluate(password = "Abc1", confirm = "Abc1zzzz")
        assertThat(state.showConfirmField).isFalse()
        assertThat(state.match).isEqualTo(PasswordMatch.UNDETERMINED)
        assertThat(state.canProceed).isFalse()
    }

    @Test
    fun evaluate_isMatched_convenienceMirrorsMatch() {
        assertThat(PasswordEntry.evaluate("Abcdefg1", "Abcdefg1").isMatched).isTrue()
        assertThat(PasswordEntry.evaluate("Abcdefg1", "nope").isMatched).isFalse()
        assertThat(PasswordEntry.evaluate("Abcdefg1", "").isMatched).isFalse()
    }
}

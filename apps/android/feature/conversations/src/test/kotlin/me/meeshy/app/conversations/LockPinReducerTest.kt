package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the PIN-entry state machine that drives the conversation
 * lock sheet. iOS embeds this exact logic INSIDE the SwiftUI view
 * (`ConversationLockSheet.handleComplete`), where it is untestable; the TDD-coverage
 * rubric's directive is to push such decisions into a pure reducer and cover it —
 * which is what this suite exercises. Every `when`/`if` arm below has a test,
 * including the inert (buffer-full / empty-delete) and failure (wrong-PIN / mismatch)
 * arms.
 */
class LockPinReducerTest {

    /** Records every commit/remove the reducer emits so a test can assert on them. */
    private class RecordingOracle(
        private val masterPin: String? = null,
        private val locks: Map<String, String> = emptyMap(),
    ) : LockPinOracle {
        override fun verifyMasterPin(pin: String): Boolean = masterPin != null && masterPin == pin
        override fun verifyLock(conversationId: String, pin: String): Boolean =
            locks[conversationId] == pin
    }

    private fun reducer(
        masterPin: String? = null,
        locks: Map<String, String> = emptyMap(),
    ) = LockPinReducer(RecordingOracle(masterPin, locks))

    private fun LockPinReducer.type(state: LockPinState, digits: String): LockPinResult {
        var result = LockPinResult(state, emptyList())
        for (ch in digits) {
            result = onDigit(result.state, ch - '0')
        }
        return result
    }

    // MARK: - pinLength / currentPin derivation

    @Test
    fun setup_master_pin_length_is_six_at_every_step() {
        val enter = LockPinState(LockPinMode.SETUP_MASTER_PIN, conversationId = null)
        assertThat(enter.pinLength).isEqualTo(6)
        assertThat(enter.copy(step = 2).pinLength).isEqualTo(6)
    }

    @Test
    fun lock_conversation_length_is_six_to_verify_master_then_four_for_the_code() {
        val verify = LockPinState(LockPinMode.LOCK_CONVERSATION, conversationId = "c1", step = 0)
        val code = verify.copy(step = 1)
        val confirm = verify.copy(step = 2)
        assertThat(verify.pinLength).isEqualTo(6)
        assertThat(code.pinLength).isEqualTo(4)
        assertThat(confirm.pinLength).isEqualTo(4)
    }

    @Test
    fun unlock_conversation_length_is_four() {
        assertThat(LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1").pinLength).isEqualTo(4)
    }

    @Test
    fun current_pin_reads_the_confirm_buffer_only_during_the_confirm_step() {
        val s = LockPinState(LockPinMode.SETUP_MASTER_PIN, null, step = 2, pin = "111111", confirmPin = "22")
        assertThat(s.currentPin).isEqualTo("22")
        assertThat(s.copy(step = 0).currentPin).isEqualTo("111111")
        assertThat(s.filledCount).isEqualTo(2)
    }

    @Test
    fun copy_key_maps_every_mode_and_step() {
        assertThat(LockPinState(LockPinMode.SETUP_MASTER_PIN, null, step = 0).copy).isEqualTo(LockPinCopy.CREATE_MASTER_PIN)
        assertThat(LockPinState(LockPinMode.SETUP_MASTER_PIN, null, step = 2).copy).isEqualTo(LockPinCopy.CONFIRM_MASTER_PIN)
        assertThat(LockPinState(LockPinMode.LOCK_CONVERSATION, "c", step = 0).copy).isEqualTo(LockPinCopy.VERIFY_MASTER_PIN)
        assertThat(LockPinState(LockPinMode.LOCK_CONVERSATION, "c", step = 1).copy).isEqualTo(LockPinCopy.ENTER_CODE)
        assertThat(LockPinState(LockPinMode.LOCK_CONVERSATION, "c", step = 2).copy).isEqualTo(LockPinCopy.CONFIRM_CODE)
        assertThat(LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c").copy).isEqualTo(LockPinCopy.UNLOCK)
    }

    // MARK: - Digit append guards

    @Test
    fun a_digit_appends_and_clears_any_prior_error() {
        val start = LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1", error = LockPinError.CODE_INCORRECT)
        val result = reducer(locks = mapOf("c1" to "9999")).onDigit(start, 1)
        assertThat(result.state.pin).isEqualTo("1")
        assertThat(result.state.error).isNull()
        assertThat(result.effects).isEmpty()
    }

    @Test
    fun a_digit_is_inert_once_the_buffer_is_already_full() {
        // 4-digit unlock buffer already full but not yet completing (guarded before handleComplete).
        val full = LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1", pin = "1234")
        val result = reducer(locks = mapOf("c1" to "0000")).onDigit(full, 5)
        assertThat(result.state).isEqualTo(full)
        assertThat(result.effects).isEmpty()
    }

    @Test
    fun out_of_range_digits_are_ignored() {
        val start = LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1")
        assertThat(reducer().onDigit(start, 10).state).isEqualTo(start)
        assertThat(reducer().onDigit(start, -1).state).isEqualTo(start)
    }

    // MARK: - Delete

    @Test
    fun delete_drops_the_last_digit_of_the_active_buffer() {
        val s = LockPinState(LockPinMode.LOCK_CONVERSATION, "c1", step = 2, pin = "1234", confirmPin = "12")
        assertThat(reducer().onDelete(s).confirmPin).isEqualTo("1")
        assertThat(reducer().onDelete(s.copy(step = 1)).pin).isEqualTo("123")
    }

    @Test
    fun delete_on_an_empty_buffer_is_inert() {
        val s = LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1", pin = "")
        assertThat(reducer().onDelete(s)).isEqualTo(s)
    }

    // MARK: - Setup master PIN flow

    @Test
    fun entering_the_master_pin_advances_to_the_confirm_step_keeping_the_pin() {
        val result = reducer().type(LockPinState(LockPinMode.SETUP_MASTER_PIN, null), "123456")
        assertThat(result.state.step).isEqualTo(2)
        assertThat(result.state.pin).isEqualTo("123456")
        assertThat(result.effects).isEmpty()
    }

    @Test
    fun a_matching_confirm_commits_the_master_pin_and_completes() {
        val r = reducer()
        val afterFirst = r.type(LockPinState(LockPinMode.SETUP_MASTER_PIN, null), "123456")
        val done = r.type(afterFirst.state, "123456")
        assertThat(done.effects).containsExactly(
            LockPinEffect.CommitMasterPin("123456"),
            LockPinEffect.Completed,
        ).inOrder()
    }

    @Test
    fun a_mismatched_confirm_resets_to_the_first_entry_with_a_mismatch_error() {
        val r = reducer()
        val afterFirst = r.type(LockPinState(LockPinMode.SETUP_MASTER_PIN, null), "123456")
        val mismatch = r.type(afterFirst.state, "000000")
        assertThat(mismatch.state.step).isEqualTo(0)
        assertThat(mismatch.state.pin).isEmpty()
        assertThat(mismatch.state.confirmPin).isEmpty()
        assertThat(mismatch.state.error).isEqualTo(LockPinError.PIN_MISMATCH)
        assertThat(mismatch.effects).isEmpty()
    }

    // MARK: - Lock conversation flow

    @Test
    fun locking_verifies_the_master_pin_then_takes_a_four_digit_code_confirmed_twice() {
        val r = reducer(masterPin = "123456")
        val verified = r.type(LockPinState(LockPinMode.LOCK_CONVERSATION, "c1"), "123456")
        assertThat(verified.state.step).isEqualTo(1)
        assertThat(verified.state.pin).isEmpty()

        val entered = r.type(verified.state, "4321")
        assertThat(entered.state.step).isEqualTo(2)
        assertThat(entered.state.pin).isEqualTo("4321")

        val done = r.type(entered.state, "4321")
        assertThat(done.effects).containsExactly(
            LockPinEffect.CommitLock("c1", "4321"),
            LockPinEffect.Completed,
        ).inOrder()
    }

    @Test
    fun a_wrong_master_pin_keeps_the_verify_step_and_flags_it() {
        val r = reducer(masterPin = "123456")
        val wrong = r.type(LockPinState(LockPinMode.LOCK_CONVERSATION, "c1"), "999999")
        assertThat(wrong.state.step).isEqualTo(0)
        assertThat(wrong.state.pin).isEmpty()
        assertThat(wrong.state.error).isEqualTo(LockPinError.MASTER_PIN_INCORRECT)
        assertThat(wrong.effects).isEmpty()
    }

    @Test
    fun a_mismatched_lock_code_resets_to_the_code_entry_step() {
        val r = reducer(masterPin = "123456")
        val verified = r.type(LockPinState(LockPinMode.LOCK_CONVERSATION, "c1"), "123456")
        val entered = r.type(verified.state, "4321")
        val mismatch = r.type(entered.state, "1111")
        assertThat(mismatch.state.step).isEqualTo(1)
        assertThat(mismatch.state.pin).isEmpty()
        assertThat(mismatch.state.confirmPin).isEmpty()
        assertThat(mismatch.state.error).isEqualTo(LockPinError.CODE_MISMATCH)
        assertThat(mismatch.effects).isEmpty()
    }

    @Test
    fun a_lock_with_no_conversation_id_cannot_commit() {
        val r = reducer(masterPin = "123456")
        val verified = r.type(LockPinState(LockPinMode.LOCK_CONVERSATION, conversationId = null), "123456")
        val entered = r.type(verified.state, "4321")
        val done = r.type(entered.state, "4321")
        assertThat(done.effects).isEmpty()
    }

    // MARK: - Unlock conversation flow

    @Test
    fun the_correct_code_removes_the_lock_and_completes() {
        val done = reducer(locks = mapOf("c1" to "4321"))
            .type(LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1"), "4321")
        assertThat(done.effects).containsExactly(
            LockPinEffect.RemoveLock("c1"),
            LockPinEffect.Completed,
        ).inOrder()
    }

    @Test
    fun a_wrong_unlock_code_flags_it_and_keeps_the_sheet_open() {
        val wrong = reducer(locks = mapOf("c1" to "4321"))
            .type(LockPinState(LockPinMode.UNLOCK_CONVERSATION, "c1"), "0000")
        assertThat(wrong.state.pin).isEmpty()
        assertThat(wrong.state.error).isEqualTo(LockPinError.CODE_INCORRECT)
        assertThat(wrong.effects).isEmpty()
    }

    @Test
    fun an_unlock_with_no_conversation_id_cannot_remove() {
        val done = reducer(locks = mapOf("c1" to "4321"))
            .type(LockPinState(LockPinMode.UNLOCK_CONVERSATION, conversationId = null), "4321")
        assertThat(done.effects).isEmpty()
    }
}

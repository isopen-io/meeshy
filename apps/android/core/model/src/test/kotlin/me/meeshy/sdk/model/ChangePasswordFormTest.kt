package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [ChangePasswordForm.validate] — the change-password gate
 * SSOT. Pins each individual rule and the composite [ChangePasswordValidation.canSubmit]
 * verdict, including the SOTA "new must differ from current" gate iOS lacks.
 */
class ChangePasswordFormTest {

    private fun validate(
        current: String = "oldpass1",
        new: String = "newpass12",
        confirm: String = "newpass12",
    ) = ChangePasswordForm.validate(current, new, confirm)

    @Test
    fun validate_allRulesSatisfied_canSubmit() {
        val v = validate()
        assertThat(v.isCurrentPresent).isTrue()
        assertThat(v.isNewLongEnough).isTrue()
        assertThat(v.passwordsMatch).isTrue()
        assertThat(v.isNewDifferent).isTrue()
        assertThat(v.canSubmit).isTrue()
    }

    @Test
    fun validate_emptyCurrent_blocksSubmit() {
        val v = validate(current = "")
        assertThat(v.isCurrentPresent).isFalse()
        assertThat(v.canSubmit).isFalse()
    }

    @Test
    fun validate_newTooShort_blocksSubmit() {
        val v = validate(new = "short12", confirm = "short12")
        assertThat(v.isNewLongEnough).isFalse()
        assertThat(v.canSubmit).isFalse()
    }

    @Test
    fun validate_minLengthBoundary_isInclusive() {
        assertThat(validate(new = "1234567", confirm = "1234567").isNewLongEnough).isFalse()
        assertThat(validate(new = "12345678", confirm = "12345678").isNewLongEnough).isTrue()
    }

    @Test
    fun validate_confirmationMismatch_blocksSubmit() {
        val v = validate(new = "newpass12", confirm = "different1")
        assertThat(v.passwordsMatch).isFalse()
        assertThat(v.canSubmit).isFalse()
    }

    @Test
    fun validate_emptyNewIsNeverMatching() {
        // An empty new + empty confirm is not "matching" — passwordsMatch requires a value.
        val v = validate(new = "", confirm = "")
        assertThat(v.passwordsMatch).isFalse()
        assertThat(v.canSubmit).isFalse()
    }

    @Test
    fun validate_newEqualsCurrent_blocksSubmitViaDifferGate() {
        val v = validate(current = "samepass12", new = "samepass12", confirm = "samepass12")
        assertThat(v.isNewDifferent).isFalse()
        // every other rule passes — only the differ gate blocks it.
        assertThat(v.isCurrentPresent).isTrue()
        assertThat(v.isNewLongEnough).isTrue()
        assertThat(v.passwordsMatch).isTrue()
        assertThat(v.canSubmit).isFalse()
    }

    @Test
    fun validate_emptyNew_leavesDifferGateInert() {
        // The differ gate does not fire while the new field is still empty.
        val v = validate(current = "oldpass1", new = "", confirm = "")
        assertThat(v.isNewDifferent).isTrue()
    }

    @Test
    fun minLength_matchesTheGatewayContract() {
        assertThat(ChangePasswordValidation.MIN_LENGTH).isEqualTo(8)
    }
}

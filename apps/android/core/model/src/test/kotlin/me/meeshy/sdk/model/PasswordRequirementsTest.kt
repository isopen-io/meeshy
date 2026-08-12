package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [PasswordRequirements.evaluate] — the port of the iOS
 * registration Step 5 `requirementsCard` (four `reqRow`s: length >= 8, an
 * uppercase, a lowercase, a digit). Each row is an independent boolean the card
 * renders with a filled / empty check-circle; [PasswordRequirementsState.allMet]
 * is the "all four green" summary.
 */
class PasswordRequirementsTest {

    @Test
    fun evaluate_emptyPassword_meetsNothing() {
        val state = PasswordRequirements.evaluate("")
        assertThat(state.length).isFalse()
        assertThat(state.uppercase).isFalse()
        assertThat(state.lowercase).isFalse()
        assertThat(state.digit).isFalse()
        assertThat(state.allMet).isFalse()
        assertThat(state.met).isEmpty()
    }

    @Test
    fun evaluate_sevenLowercase_missesLengthOnly() {
        // 7 chars: length gate fails, lowercase row passes, no upper/digit.
        val state = PasswordRequirements.evaluate("abcdefg")
        assertThat(state.length).isFalse()
        assertThat(state.lowercase).isTrue()
        assertThat(state.uppercase).isFalse()
        assertThat(state.digit).isFalse()
        assertThat(state.allMet).isFalse()
    }

    @Test
    fun evaluate_exactlyEightChars_meetsLengthGate() {
        // The gate is >= 8, so exactly 8 is the boundary that passes.
        assertThat(PasswordRequirements.evaluate("abcdefgh").length).isTrue()
        assertThat(PasswordRequirements.evaluate("abcdefg").length).isFalse()
    }

    @Test
    fun evaluate_uppercasePresent_meetsUppercaseRow() {
        assertThat(PasswordRequirements.evaluate("A").uppercase).isTrue()
        assertThat(PasswordRequirements.evaluate("a").uppercase).isFalse()
    }

    @Test
    fun evaluate_lowercasePresent_meetsLowercaseRow() {
        assertThat(PasswordRequirements.evaluate("a").lowercase).isTrue()
        assertThat(PasswordRequirements.evaluate("A").lowercase).isFalse()
    }

    @Test
    fun evaluate_digitPresent_meetsDigitRow() {
        assertThat(PasswordRequirements.evaluate("1").digit).isTrue()
        assertThat(PasswordRequirements.evaluate("a").digit).isFalse()
    }

    @Test
    fun evaluate_allFourSatisfied_allMetTrueAndSetComplete() {
        val state = PasswordRequirements.evaluate("Abcdefg1")
        assertThat(state.length).isTrue()
        assertThat(state.uppercase).isTrue()
        assertThat(state.lowercase).isTrue()
        assertThat(state.digit).isTrue()
        assertThat(state.allMet).isTrue()
        assertThat(state.met).containsExactly(
            PasswordRequirement.LENGTH,
            PasswordRequirement.UPPERCASE,
            PasswordRequirement.LOWERCASE,
            PasswordRequirement.DIGIT,
        )
    }

    @Test
    fun evaluate_eightCharsButNoUppercase_allMetFalse() {
        // length + lowercase + digit met, uppercase missing → not all met.
        val state = PasswordRequirements.evaluate("abcdefg1")
        assertThat(state.uppercase).isFalse()
        assertThat(state.allMet).isFalse()
        assertThat(state.met).doesNotContain(PasswordRequirement.UPPERCASE)
    }

    @Test
    fun evaluate_symbolIsNotARequirement() {
        // The card has no "special character" row — a symbol alone meets nothing.
        val state = PasswordRequirements.evaluate("!!!!!!!!")
        assertThat(state.length).isTrue()
        assertThat(state.uppercase).isFalse()
        assertThat(state.lowercase).isFalse()
        assertThat(state.digit).isFalse()
        assertThat(state.allMet).isFalse()
    }

    @Test
    fun isMet_matchesTheNamedFlags() {
        val state = PasswordRequirements.evaluate("Abcdefg1")
        PasswordRequirement.entries.forEach { req ->
            assertThat(state.isMet(req)).isEqualTo(req in state.met)
        }
    }

    @Test
    fun requirements_areTheFourRowsInCardOrder() {
        assertThat(PasswordRequirements.evaluate("Abcdefg1").met)
            .containsExactly(
                PasswordRequirement.LENGTH,
                PasswordRequirement.UPPERCASE,
                PasswordRequirement.LOWERCASE,
                PasswordRequirement.DIGIT,
            )
            .inOrder()
    }
}

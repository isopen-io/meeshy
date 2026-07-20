package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [PasswordStrength.evaluate] — the port of iOS
 * `PasswordStrengthIndicator.strength`. Each heuristic contributes one point and
 * the total is capped at 5; the tests pin every band boundary and each
 * character-class contribution.
 */
class PasswordStrengthTest {

    @Test
    fun evaluate_emptyPassword_isTooWeak() {
        assertThat(PasswordStrength.evaluate("")).isEqualTo(PasswordStrengthLevel.TOO_WEAK)
        assertThat(PasswordStrength.evaluate("").score).isEqualTo(0)
    }

    @Test
    fun evaluate_shortLowercaseOnly_scoresOneWeak() {
        // 7 lowercase letters: length<8, only the lowercase heuristic → 1.
        assertThat(PasswordStrength.evaluate("abcdefg")).isEqualTo(PasswordStrengthLevel.WEAK)
    }

    @Test
    fun evaluate_uppercaseOnlyShort_scoresOneWeak() {
        assertThat(PasswordStrength.evaluate("ABCDEFG")).isEqualTo(PasswordStrengthLevel.WEAK)
    }

    @Test
    fun evaluate_digitsOnlyShort_scoresOneWeak() {
        assertThat(PasswordStrength.evaluate("1234567")).isEqualTo(PasswordStrengthLevel.WEAK)
    }

    @Test
    fun evaluate_symbolsOnlyShort_scoresOneWeak() {
        assertThat(PasswordStrength.evaluate("!!!!!!!")).isEqualTo(PasswordStrengthLevel.WEAK)
    }

    @Test
    fun evaluate_eightLowercase_scoresTwoMedium() {
        // length≥8 (+1) + lowercase (+1) = 2.
        assertThat(PasswordStrength.evaluate("abcdefgh")).isEqualTo(PasswordStrengthLevel.MEDIUM)
    }

    @Test
    fun evaluate_eightMixedCase_scoresThreeGood() {
        // length≥8 (+1) + upper (+1) + lower (+1) = 3.
        assertThat(PasswordStrength.evaluate("Abcdefgh")).isEqualTo(PasswordStrengthLevel.GOOD)
    }

    @Test
    fun evaluate_eightMixedCaseDigit_scoresFourStrong() {
        // length≥8 (+1) + upper + lower + digit = 4.
        assertThat(PasswordStrength.evaluate("Abcdefg1")).isEqualTo(PasswordStrengthLevel.STRONG)
    }

    @Test
    fun evaluate_shortButAllClasses_scoresFiveExcellent() {
        // 10 chars <12: length≥8 (+1) + upper + lower + digit + symbol = 5.
        assertThat(PasswordStrength.evaluate("Abcdefg1!!")).isEqualTo(PasswordStrengthLevel.EXCELLENT)
    }

    @Test
    fun evaluate_allSixHeuristics_capsAtFiveExcellent() {
        // 14 chars: length≥8 + length≥12 + upper + lower + digit + symbol = 6 → capped to 5.
        val level = PasswordStrength.evaluate("Abcdefghijk1!")
        assertThat(level).isEqualTo(PasswordStrengthLevel.EXCELLENT)
        assertThat(level.score).isEqualTo(PasswordStrength.MAX_SCORE)
    }

    @Test
    fun evaluate_twelveLowercase_countsBothLengthGates() {
        // length≥8 + length≥12 + lowercase = 3.
        assertThat(PasswordStrength.evaluate("abcdefghijkl")).isEqualTo(PasswordStrengthLevel.GOOD)
    }

    @Test
    fun evaluate_hyphenAndBracketsCountAsSymbols() {
        // The special set includes '-', '[', ']' as literals (membership, not regex).
        assertThat(PasswordStrength.evaluate("abcde-fg").score)
            .isEqualTo(PasswordStrength.evaluate("abcdexfg").score + 1)
        assertThat(PasswordStrength.evaluate("abcde[fg").score)
            .isEqualTo(PasswordStrength.evaluate("abcdexfg").score + 1)
    }

    @Test
    fun evaluate_spaceIsNotASymbol() {
        // A space is neither a counted symbol nor upper/lower/digit.
        assertThat(PasswordStrength.evaluate("abcde fg").score)
            .isEqualTo(PasswordStrength.evaluate("abcdexfg").score)
    }

    @Test
    fun levelScores_areTheOrdinalBands() {
        assertThat(PasswordStrengthLevel.entries.map { it.score })
            .containsExactly(0, 1, 2, 3, 4, 5)
            .inOrder()
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La jauge de force d'un mot de passe : six niveaux, cinq segments, une teinte du rouge
 * au vert. Port de `PasswordStrengthIndicator` (iOS, `MeeshyUI/Auth/Components`) : les
 * segments remplis sont `min(score, 5)`, l'étiquette n'apparaît qu'une fois qu'on a tapé
 * quelque chose, et deux niveaux voisins partagent la même teinte (0 et 1 rouges, 4 et 5
 * verts) — la teinte ne suffit jamais à les distinguer, l'étiquette le fait.
 */
class PasswordStrengthMeterTest {

    private fun meter(password: String) = PasswordStrengthMeter.of(password)

    @Test
    fun `a password with no class at all fills no segment but still names itself too weak`() {
        val meter = meter(" ")

        assertThat(meter.level).isEqualTo(PasswordStrengthLevel.TOO_WEAK)
        assertThat(meter.filledSegments).isEqualTo(0)
        assertThat(meter.showsLabel).isTrue()
    }

    @Test
    fun `an empty field shows its five empty segments and no label`() {
        val meter = meter("")

        assertThat(meter.filledSegments).isEqualTo(0)
        assertThat(meter.totalSegments).isEqualTo(5)
        assertThat(meter.showsLabel).isFalse()
    }

    @Test
    fun `each of the six levels fills as many segments as its score`() {
        val byPassword = mapOf(
            " " to 0,
            "abcdefg" to 1,
            "abcdefgh" to 2,
            "Abcdefgh" to 3,
            "Abcdefg1" to 4,
            "Abcdefg1!!" to 5,
        )

        byPassword.forEach { (password, filled) ->
            assertThat(meter(password).filledSegments).isEqualTo(filled)
            assertThat(meter(password).level.score).isEqualTo(filled)
        }
    }

    @Test
    fun `the tone climbs from danger to success as the level rises`() {
        val tones = listOf(" ", "abcdefg", "abcdefgh", "Abcdefgh", "Abcdefg1", "Abcdefg1!!").map { meter(it).tone }

        assertThat(tones).containsExactly(
            PasswordStrengthTone.DANGER,
            PasswordStrengthTone.DANGER,
            PasswordStrengthTone.WARNING,
            PasswordStrengthTone.CAUTION,
            PasswordStrengthTone.SUCCESS,
            PasswordStrengthTone.SUCCESS,
        ).inOrder()
    }

    @Test
    fun `the segment count never exceeds the number of drawn segments`() {
        val meter = meter("Abcdefghijk1!")

        assertThat(meter.filledSegments).isEqualTo(PasswordStrengthMeter.SEGMENT_COUNT)
        assertThat(meter.level).isEqualTo(PasswordStrengthLevel.EXCELLENT)
    }
}

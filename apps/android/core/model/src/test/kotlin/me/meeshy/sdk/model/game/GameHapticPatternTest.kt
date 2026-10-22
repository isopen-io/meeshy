package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameHapticPatternTest {

    @Test
    fun `la frappe est un choc net a 0,45 s puis un rebond a 0,54 s`() {
        assertThat(GameHapticPattern.strike).containsExactly(
            GameHapticTap(0.45, 1.0f, 1.0f),
            GameHapticTap(0.54, 0.45f, 0.55f),
        ).inOrder()
    }

    @Test
    fun `la frappe se cale sur l'impact de la chorégraphie`() {
        assertThat(GameHapticPattern.strike.first().timeSeconds).isEqualTo(GameTimeline.STRIKE_IMPACT)
    }

    @Test
    fun `la frappe en place tombe au declenchement`() {
        assertThat(GameHapticPattern.strikeInPlace.map { it.timeSeconds }).containsExactly(0.0, 0.09).inOrder()
    }

    @Test
    fun `le rang tape une fois par trait de la Signature`() {
        assertThat(GameHapticPattern.rank.map { it.timeSeconds })
            .containsExactlyElementsIn(GameTimeline.RANK_STROKE_TIMES).inOrder()
        assertThat(GameHapticPattern.rank.map { it.intensity }).containsExactly(0.55f, 0.7f, 0.9f).inOrder()
    }

    @Test
    fun `niveau gagne et badge allume sont une tape legere`() {
        assertThat(GameHapticPattern.levelGain).containsExactly(GameHapticTap(0.45, 0.4f, 0.5f))
        assertThat(GameHapticPattern.badgeLit).containsExactly(GameHapticTap(0.5, 0.4f, 0.5f))
    }

    @Test
    fun `le niveau perdu ne vibre pas`() {
        assertThat(GameHapticPattern.levelLoss).isEmpty()
    }

    @Test
    fun `le coffre tape une fois par recompense`() {
        val taps = GameHapticPattern.chest(rewards = 3)
        assertThat(taps.map { it.timeSeconds }).hasSize(3)
        assertThat(taps[2].timeSeconds).isWithin(1e-9).of(1.1)
        assertThat(taps.map { it.intensity }.toSet()).containsExactly(0.55f)
        assertThat(GameHapticPattern.chest(0)).isEmpty()
        assertThat(GameHapticPattern.chest(-2)).isEmpty()
    }

    @Test
    fun `un coup de ceremonie est franc et le dernier frappe`() {
        assertThat(GameHapticPattern.ceremonyBlow(final = false)).containsExactly(GameHapticTap(0.0, 0.6f, 0.75f))
        assertThat(GameHapticPattern.ceremonyBlow(final = true)).isEqualTo(GameHapticPattern.strikeInPlace)
    }
}

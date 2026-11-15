package me.meeshy.sdk.model.audioedit

import com.google.common.truth.Truth.assertThat
import org.junit.Assert.assertThrows
import org.junit.Test

class AudioEditPlanTest {

    private fun lower(op: AudioEditOperation, duration: Double = 10.0) = AudioEditPlan.lower(op, duration)

    @Test
    fun `original garde toute la source`() {
        val plan = lower(AudioEditOperation.Original)
        assertThat(plan.keptRanges).containsExactly(AudioTimeRange(0.0, 10.0))
        assertThat(plan.speed).isEqualTo(1.0)
    }

    @Test
    fun `trim inversé ou débordant est clampé`() {
        val plan = lower(AudioEditOperation.Trim(start = 20.0, end = -3.0))
        assertThat(plan.keptRanges).containsExactly(AudioTimeRange(0.0, 10.0))
    }

    @Test
    fun `trim trop court échoue en résultat trop court`() {
        assertThrows(AudioEditError.ResultTooShort::class.java) { lower(AudioEditOperation.Trim(2.0, 2.05)) }
    }

    @Test
    fun `removeRange garde la tête et la queue`() {
        val plan = lower(AudioEditOperation.RemoveRange(3.0, 6.0))
        assertThat(plan.keptRanges).containsExactly(AudioTimeRange(0.0, 3.0), AudioTimeRange(6.0, 10.0)).inOrder()
        assertThat(plan.finalDuration).isWithin(1e-9).of(7.0)
    }

    @Test
    fun `removeRange qui efface tout échoue`() {
        assertThrows(AudioEditError.ResultTooShort::class.java) { lower(AudioEditOperation.RemoveRange(-1.0, 99.0)) }
    }

    @Test
    fun `vitesse et gain sont bornés`() {
        assertThat(lower(AudioEditOperation.Speed(99.0)).speed).isEqualTo(3.0)
        assertThat(lower(AudioEditOperation.Speed(0.0)).speed).isEqualTo(0.25)
        assertThat(lower(AudioEditOperation.Gain(100.0)).gain).isEqualTo(4f)
        assertThat(lower(AudioEditOperation.Gain(-2.0)).gain).isEqualTo(0f)
    }

    @Test
    fun `des valeurs non finies ne plantent jamais`() {
        assertThat(lower(AudioEditOperation.Speed(Double.NaN)).speed).isEqualTo(1.0)
        assertThat(lower(AudioEditOperation.Gain(Double.POSITIVE_INFINITY)).gain).isEqualTo(0f)
        assertThat(lower(AudioEditOperation.Original, Double.NaN).keptRanges).containsExactly(AudioTimeRange(0.0, 0.0))
    }

    @Test
    fun `la vitesse raccourcit la durée finale`() {
        assertThat(lower(AudioEditOperation.Speed(2.0)).finalDuration).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `le fondu est borné entre 0,2 et 1,2 seconde et s'étend sur un tiers`() {
        assertThat(AudioEditPlan.fadeSecondsFor(0.3)).isEqualTo(0.2)
        assertThat(AudioEditPlan.fadeSecondsFor(3.0)).isEqualTo(1.0)
        assertThat(AudioEditPlan.fadeSecondsFor(60.0)).isEqualTo(1.2)
    }

    @Test
    fun `l'enveloppe de fondu monte au début et descend à la fin`() {
        assertThat(AudioFadeEnvelope.gainAt(0.0, 10.0, true, true)).isEqualTo(0.0)
        assertThat(AudioFadeEnvelope.gainAt(0.6, 10.0, true, true)).isWithin(1e-9).of(0.5)
        assertThat(AudioFadeEnvelope.gainAt(5.0, 10.0, true, true)).isEqualTo(1.0)
        assertThat(AudioFadeEnvelope.gainAt(10.0, 10.0, true, true)).isEqualTo(0.0)
        assertThat(AudioFadeEnvelope.gainAt(0.0, 10.0, false, false)).isEqualTo(1.0)
    }
}

package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerObjectTimingTest {

    private fun timing(s: Double, e: Double?) = ComposerObjectTiming(s, e)

    @Test
    fun `deux absences donnent un objet permanent range en deux null`() {
        val t = ComposerObjectTiming.of(null, null)
        assertThat(t.isPermanent).isTrue()
        assertThat(t.storedStartTime).isNull()
        assertThat(t.storedDuration).isNull()
    }

    @Test
    fun `debut et duree donnent une fenetre debut fin`() {
        val t = ComposerObjectTiming.of(1.2, 4.8)
        assertThat(t.end).isWithin(1e-9).of(6.0)
        assertThat(t.storedStartTime).isEqualTo(1.2)
        assertThat(t.storedDuration).isWithin(1e-9).of(4.8)
    }

    @Test
    fun `une duree nulle ou negative reste permanente et le debut negatif est ramene a zero`() {
        assertThat(ComposerObjectTiming.of(-3.0, 0.0)).isEqualTo(timing(0.0, null))
    }

    @Test
    fun `moved conserve la longueur et reste dans la slide`() {
        val t = timing(1.0, 3.0).moved(to = 9.0, slideDuration = 6.0)
        assertThat(t).isEqualTo(timing(4.0, 6.0))
        assertThat(timing(1.0, 3.0).moved(-5.0, 6.0)).isEqualTo(timing(0.0, 2.0))
    }

    @Test
    fun `moved preserve nil pour un objet permanent`() {
        assertThat(timing(1.0, null).moved(2.5, 6.0)).isEqualTo(timing(2.5, null))
    }

    @Test
    fun `trimmingStart ne bouge pas la fin et garde la fenetre minimale`() {
        assertThat(timing(1.0, 4.0).trimmingStart(2.0)).isEqualTo(timing(2.0, 4.0))
        assertThat(timing(1.0, 4.0).trimmingStart(9.0).start).isWithin(1e-9).of(3.7)
        assertThat(timing(1.0, 4.0).trimmingStart(-1.0).start).isEqualTo(0.0)
        assertThat(timing(1.0, null).trimmingStart(2.0)).isEqualTo(timing(2.0, null))
    }

    @Test
    fun `trimmingEnd garde fin au moins debut plus fenetre et dans la slide`() {
        assertThat(timing(1.0, 4.0).trimmingEnd(5.0, 6.0)).isEqualTo(timing(1.0, 5.0))
        assertThat(timing(1.0, 4.0).trimmingEnd(1.1, 6.0).end!!).isWithin(1e-9).of(1.3)
        assertThat(timing(1.0, 4.0).trimmingEnd(99.0, 6.0).end).isEqualTo(6.0)
    }

    @Test
    fun `trimmingEnd sur un permanent fixe une fin et madePermanent la retire`() {
        val t = timing(1.0, null).trimmingEnd(3.0, 6.0)
        assertThat(t.end).isEqualTo(3.0)
        assertThat(t.madePermanent).isEqualTo(timing(1.0, null))
    }

    @Test
    fun `fin toujours superieure ou egale au debut sur toutes les combinaisons`() {
        val values = listOf(-1.0, 0.0, 0.2, 1.0, 3.0, 5.9, 6.0, 12.0)
        for (s in values) for (e in values) {
            val base = timing(maxOf(0.0, s), e.takeIf { it > maxOf(0.0, s) })
            listOf(base.moved(e, 6.0), base.trimmingStart(e), base.trimmingEnd(e, 6.0)).forEach {
                assertThat(it.start).isAtLeast(0.0)
                it.end?.let { end -> assertThat(end).isAtLeast(it.start) }
            }
        }
    }

    @Test
    fun `libelle De 1,2 s a 6 s`() {
        val parts = timing(1.2, 6.0).windowParts()
        assertThat(parts.startText).isEqualTo("1,2")
        assertThat(parts.endText).isEqualTo("6")
        assertThat(timing(1.2, null).windowParts().endText).isNull()
        assertThat(ComposerObjectTiming.formatSeconds(1.25, '.')).isEqualTo("1.3")
    }
}

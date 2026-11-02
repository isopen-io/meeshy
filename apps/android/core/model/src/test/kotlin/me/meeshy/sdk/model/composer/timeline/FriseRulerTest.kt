package me.meeshy.sdk.model.composer.timeline

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class FriseRulerTest {

    @Test
    fun `une scene de six secondes se gradue a la seconde`() {
        val majors = FriseRuler.ticks(6f, 300f).filter { it.isMajor }
        assertThat(majors.map { it.time }).containsExactly(0f, 1f, 2f, 3f, 4f, 5f, 6f).inOrder()
        assertThat(majors.first().label).isEqualTo("0 s")
        assertThat(majors.last().label).isEqualTo("6 s")
    }

    @Test
    fun `une scene de deux heures garde au plus treize libelles dans la duree`() {
        val ticks = FriseRuler.ticks(7200f, 300f)
        assertThat(ticks.count { it.isMajor }).isAtMost(13)
        assertThat(ticks.count { it.isMajor }).isAtLeast(2)
        assertThat(ticks.all { it.time in 0f..7200f }).isTrue()
    }

    @Test
    fun `deux libelles restent lisibles`() {
        listOf(1f, 3f, 6f, 15f, 42f, 90f, 600f, 3599f, 7200f).forEach { d ->
            assertThat(FriseRuler.majorStep(d, 280f) / d * 280f).isAtLeast(FriseRuler.LABEL_GAP_DP)
        }
    }

    @Test
    fun `les mineures ne se serrent jamais sous six dp`() {
        val times = FriseRuler.ticks(6f, 300f).map { it.time }.sorted()
        assertThat(FriseRuler.ticks(6f, 300f).any { !it.isMajor }).isTrue()
        val gap = times.zipWithNext { a, b -> (b - a) / 6f * 300f }.min()
        assertThat(gap).isAtLeast(FriseRuler.MINOR_GAP_DP)
    }

    @Test
    fun `un libelle passe aux minutes puis aux heures`() {
        assertThat(FriseRuler.label(45f)).isEqualTo("45 s")
        assertThat(FriseRuler.label(90f)).isEqualTo("1:30")
        assertThat(FriseRuler.label(3600f)).isEqualTo("1:00:00")
    }

    @Test
    fun `la tete qui franchit une graduation majeure se sent dans les deux sens`() {
        assertThat(FriseRuler.crossesMajor(0.9f, 1.1f, 1f)).isTrue()
        assertThat(FriseRuler.crossesMajor(2.2f, 1.9f, 1f)).isTrue()
        assertThat(FriseRuler.crossesMajor(1.1f, 1.6f, 1f)).isFalse()
        assertThat(FriseRuler.crossesMajor(1.1f, 1.6f, 0f)).isFalse()
    }
}

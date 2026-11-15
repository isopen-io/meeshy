package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ArrivalFireworksTest {
    @Test
    fun `le spectacle dure 2,6 secondes`() {
        assertThat(ArrivalFireworks.SHOW_DURATION_SECONDS).isWithin(1e-9).of(2.58)
        assertThat(ArrivalFireworks.isOver(2.57)).isFalse()
        assertThat(ArrivalFireworks.isOver(2.58)).isTrue()
    }

    @Test
    fun `avant la premiere gerbe et apres la derniere il n'y a aucune etincelle`() {
        assertThat(ArrivalFireworks.sparks(-0.1)).isEmpty()
        assertThat(ArrivalFireworks.sparks(ArrivalFireworks.SHOW_DURATION_SECONDS)).isEmpty()
    }

    @Test
    fun `une gerbe porte seize etincelles et le dessin est deterministe`() {
        val first = ArrivalFireworks.sparks(0.2)
        assertThat(first).hasSize(ArrivalFireworks.SPARKS_PER_BURST)
        assertThat(ArrivalFireworks.sparks(0.2)).isEqualTo(first)
    }

    @Test
    fun `les etincelles restent a peu pres dans la surface, s'eteignent et gardent une teinte de la palette`() {
        val all = (0..260).flatMap { ArrivalFireworks.sparks(it / 100.0) }
        assertThat(all).isNotEmpty()
        all.forEach {
            assertThat(it.x).isIn(com.google.common.collect.Range.closed(-0.05, 1.05))
            assertThat(it.y).isIn(com.google.common.collect.Range.closed(-0.05, 1.05))
            assertThat(it.opacity).isIn(com.google.common.collect.Range.closed(0.0, 1.0))
            assertThat(it.colorIndex).isIn(com.google.common.collect.Range.closed(0, ArrivalFireworks.PALETTE_COUNT - 1))
        }
    }

    @Test
    fun `le nombre d'etincelles vivantes est plafonne`() {
        val peak = (0..260).maxOf { ArrivalFireworks.sparks(it / 100.0, maxSparks = 30).size }
        assertThat(peak).isAtMost(30)
    }

    @Test
    fun `animations reduites donne un fondu sans particule`() {
        assertThat(ArrivalCelebrationMotion.of(reduceMotion = true)).isEqualTo(ArrivalCelebrationMotion.FADE)
        assertThat(ArrivalCelebrationMotion.FADE.showsParticles).isFalse()
        assertThat(ArrivalCelebrationMotion.of(reduceMotion = false)).isEqualTo(ArrivalCelebrationMotion.FIREWORKS)
        assertThat(ArrivalCelebrationMotion.FIREWORKS.showsParticles).isTrue()
    }
}

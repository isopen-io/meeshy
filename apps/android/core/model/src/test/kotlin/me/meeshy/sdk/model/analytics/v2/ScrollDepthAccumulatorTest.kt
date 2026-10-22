package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ScrollDepthAccumulatorTest {

    private fun scrolled(vararg samples: Pair<Double, Int>) = ScrollDepthAccumulator().apply {
        samples.forEach { (offset, at) -> sample(offset, at) }
    }

    @Test
    fun `un echantillon plus proche que 100 ms du precedent est decime`() {
        val a = ScrollDepthAccumulator()
        assertThat(a.sample(0.0, 0)).isTrue()
        assertThat(a.sample(50.0, 99)).isFalse()
        assertThat(a.sample(50.0, 100)).isTrue()
        assertThat(a.distanceDp).isEqualTo(50)
    }

    @Test
    fun `un ecart de plus d'une seconde est borne a une seconde`() {
        val a = scrolled(0.0 to 0, 100.0 to 5_000)
        assertThat(a.activeScrollMs).isEqualTo(1_000)
        assertThat(a.distanceDp).isEqualTo(100)
    }

    @Test
    fun `les quatre classes de vitesse sont aux bornes 500 1500 et 4000`() {
        // 100 ms par pas : un delta de N dp vaut 10 x N dp/s
        fun histogram(deltaDp: Int) = scrolled(0.0 to 0, deltaDp.toDouble() to 100).velocityHistogram
        assertThat(histogram(49)).containsExactly(100, 0, 0, 0).inOrder()
        assertThat(histogram(50)).containsExactly(0, 100, 0, 0).inOrder()
        assertThat(histogram(149)).containsExactly(0, 100, 0, 0).inOrder()
        assertThat(histogram(150)).containsExactly(0, 0, 100, 0).inOrder()
        assertThat(histogram(399)).containsExactly(0, 0, 100, 0).inOrder()
        assertThat(histogram(400)).containsExactly(0, 0, 0, 100).inOrder()
    }

    @Test
    fun `un changement de sens et une remontee sont comptes`() {
        val a = scrolled(0.0 to 0, 100.0 to 100, 40.0 to 200, 80.0 to 300)
        assertThat(a.directionChanges).isEqualTo(2)
        assertThat(a.distanceDp).isEqualTo(200)
        assertThat(a.upDistanceRatio).isEqualTo(0.3)
    }

    @Test
    fun `une immobilite d'une seconde apres un mouvement compte un arret une seule fois`() {
        val a = scrolled(0.0 to 0, 100.0 to 100, 100.0 to 200, 100.0 to 1_200, 100.0 to 2_400)
        assertThat(a.stops).isEqualTo(1)
    }

    @Test
    fun `sans mouvement il n'y a jamais d'arret`() {
        assertThat(scrolled(0.0 to 0, 0.0 to 2_000).stops).isEqualTo(0)
    }

    @Test
    fun `un geste lance entre dans la classe rapide une fois par rafale`() {
        val a = scrolled(0.0 to 0, 500.0 to 100, 1_000.0 to 200, 1_010.0 to 300, 1_600.0 to 400)
        assertThat(a.flings).isEqualTo(2)
    }

    @Test
    fun `les compteurs de listing s'additionnent`() {
        val a = ScrollDepthAccumulator().apply {
            noteRendered(4); noteRendered(2); noteViewable(); noteRefresh(); notePagination(); noteReachedEnd()
        }
        assertThat(a.maxPosition).isEqualTo(4)
        assertThat(a.itemsViewable).isEqualTo(1)
        assertThat(a.refreshes).isEqualTo(1)
        assertThat(a.paginations).isEqualTo(1)
        assertThat(a.reachedEnd).isTrue()
    }
}

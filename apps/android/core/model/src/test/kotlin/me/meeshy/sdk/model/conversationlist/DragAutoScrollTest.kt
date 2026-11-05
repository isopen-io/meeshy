package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DragAutoScrollTest {

    private val min = 100f
    private val max = 1900f

    private fun speed(y: Float) = DragAutoScroll.speed(y, min, max)

    @Test
    fun `au milieu de la liste il n y a pas de défilement`() {
        assertThat(speed(1000f)).isEqualTo(0f)
    }

    @Test
    fun `au bord haut la vitesse est maximale vers le haut`() {
        assertThat(speed(min)).isEqualTo(-DragAutoScroll.MAX_SPEED_DP_PER_SECOND)
        assertThat(speed(min - 40f)).isEqualTo(-DragAutoScroll.MAX_SPEED_DP_PER_SECOND)
    }

    @Test
    fun `au bord bas la vitesse est maximale vers le bas`() {
        assertThat(speed(max)).isEqualTo(DragAutoScroll.MAX_SPEED_DP_PER_SECOND)
    }

    @Test
    fun `la rampe est linéaire dans la zone et nulle à son entrée`() {
        val zone = DragAutoScroll.ZONE_DP
        assertThat(speed(min + zone)).isEqualTo(0f)
        assertThat(speed(min + zone / 2)).isWithin(0.01f).of(-DragAutoScroll.MAX_SPEED_DP_PER_SECOND / 2)
        assertThat(speed(max - zone / 2)).isWithin(0.01f).of(DragAutoScroll.MAX_SPEED_DP_PER_SECOND / 2)
    }

    @Test
    fun `la zone et la vitesse suivent la densité`() {
        val dense = DragAutoScroll.speed(100f + 130f * 2, 100f, 3000f, density = 2f)
        assertThat(dense).isEqualTo(0f)
        assertThat(DragAutoScroll.speed(100f, 100f, 3000f, density = 2f))
            .isEqualTo(-DragAutoScroll.MAX_SPEED_DP_PER_SECOND * 2)
    }

    @Test
    fun `le pas de temps crédité est borné à 50 ms`() {
        assertThat(DragAutoScroll.displacement(speed = 900f, elapsedMillis = 1000L)).isWithin(0.001f).of(45f)
        assertThat(DragAutoScroll.displacement(speed = 900f, elapsedMillis = 16L)).isWithin(0.001f).of(14.4f)
        assertThat(DragAutoScroll.displacement(speed = 900f, elapsedMillis = -5L)).isEqualTo(0f)
    }

    @Test
    fun `l horloge ne tourne que si la vitesse est non nulle`() {
        assertThat(DragAutoScroll.shouldRun(0f)).isFalse()
        assertThat(DragAutoScroll.shouldRun(-1f)).isTrue()
        assertThat(DragAutoScroll.shouldRun(300f)).isTrue()
    }
}

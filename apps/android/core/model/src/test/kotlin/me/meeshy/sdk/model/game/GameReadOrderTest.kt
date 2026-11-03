package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameReadOrderTest {

    @Test
    fun `une lecture partie avant un geste est refusee`() {
        val order = GameReadOrder()
        val ticket = order.issue()
        order.beginGesture()
        assertThat(order.admits(ticket)).isFalse()
        assertThat(order.admits(order.issue())).isTrue()
    }

    @Test
    fun `une lecture plus ancienne que la derniere posee est refusee`() {
        val order = GameReadOrder()
        val first = order.issue()
        val second = order.issue()
        assertThat(order.admits(second)).isTrue()
        assertThat(order.admits(first)).isFalse()
    }

    @Test
    fun `une meme lecture peut se poser deux fois`() {
        val order = GameReadOrder()
        val ticket = order.issue()
        assertThat(order.admits(ticket)).isTrue()
        assertThat(order.admits(ticket)).isTrue()
    }

    @Test
    fun `Confirmed ne recule jamais`() {
        val up = GameReadOrder.Confirmed().raised(revision = 10L, minted = 5)
        val down = up.raised(revision = 4L, minted = 2)
        assertThat(down).isEqualTo(up)
        assertThat(up.raised(revision = null, minted = null)).isEqualTo(up)
        assertThat(GameReadOrder.Confirmed().raised(null, null).revision).isNull()
    }

    @Test
    fun `une charge en retard de revision ou de Meeshes frappees n est pas a jour`() {
        val confirmed = GameReadOrder.Confirmed(revision = 10L, minted = 5)
        assertThat(GameReadOrder.isCurrent(9L, 9, confirmed)).isFalse()
        assertThat(GameReadOrder.isCurrent(10L, 4, confirmed)).isFalse()
        assertThat(GameReadOrder.isCurrent(10L, 5, confirmed)).isTrue()
        assertThat(GameReadOrder.isCurrent(null, 5, confirmed)).isTrue()
        assertThat(GameReadOrder.isCurrent(11L, null, confirmed)).isTrue()
        assertThat(GameReadOrder.isCurrent(null, null, confirmed)).isTrue()
    }
}

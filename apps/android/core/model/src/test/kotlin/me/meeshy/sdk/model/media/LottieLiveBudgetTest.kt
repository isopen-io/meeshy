package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LottieLiveBudgetTest {
    private class Layer(val budget: LottieLiveBudget) {
        var live = false
        val ticket = budget.claim(grant = { live = true }, evict = { live = false })
        fun show() = budget.setVisible(ticket, true)
        fun hide() = budget.setVisible(ticket, false)
    }

    @Test fun `huit places au plus`() {
        val budget = LottieLiveBudget(LottieLiveBudget.MAX_LIVE_LAYERS)
        val layers = List(9) { Layer(budget) }
        layers.forEach { it.show() }
        assertThat(layers.count { it.live }).isEqualTo(8)
        assertThat(layers.last().live).isFalse()
        assertThat(budget.holders).isEqualTo(8)
    }

    @Test fun `une couche sortie garde sa place tant que personne n'en a besoin`() {
        val budget = LottieLiveBudget(2)
        val a = Layer(budget).also { it.show() }
        Layer(budget).also { it.show() }
        a.hide()
        assertThat(a.live).isTrue()
    }

    @Test fun `sous pression la plus anciennement sortie est reprise`() {
        val budget = LottieLiveBudget(2)
        val a = Layer(budget).also { it.show() }
        val b = Layer(budget).also { it.show() }
        a.hide()
        b.hide()
        val c = Layer(budget).also { it.show() }
        assertThat(a.live).isFalse()
        assertThat(b.live).isTrue()
        assertThat(c.live).isTrue()
    }

    @Test fun `toutes a l'ecran la nouvelle attend puis prend la place liberee`() {
        val budget = LottieLiveBudget(1)
        val a = Layer(budget).also { it.show() }
        val b = Layer(budget).also { it.show() }
        assertThat(b.live).isFalse()
        budget.release(a.ticket)
        assertThat(b.live).isTrue()
    }

    @Test fun `une attente qui ressort perd son tour`() {
        val budget = LottieLiveBudget(1)
        Layer(budget).also { it.show() }
        val b = Layer(budget).also { it.show(); it.hide() }
        val c = Layer(budget)
        c.show()
        assertThat(b.live).isFalse()
        assertThat(budget.holders).isEqualTo(1)
    }
}

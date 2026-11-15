package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameSpendTest {

    @Test
    fun `un geste abordable dit ce qui restera`() {
        val p = GameSpend.preview(held = 1000, cost = 300)
        assertThat(p.affordable).isTrue()
        assertThat(p.after).isEqualTo(700L)
        assertThat(p.missing).isEqualTo(0L)
    }

    @Test
    fun `un solde insuffisant dit ce qui manque et garde le solde`() {
        val p = GameSpend.preview(held = 100, cost = 300)
        assertThat(p.affordable).isFalse()
        assertThat(p.missing).isEqualTo(200L)
        assertThat(p.after).isEqualTo(100L)
    }

    @Test
    fun `seule la part depensable paie`() {
        val p = GameSpend.preview(held = 1000, cost = 300, spendable = 120)
        assertThat(p.affordable).isFalse()
        assertThat(p.missing).isEqualTo(180L)
    }

    @Test
    fun `le geste vise est nomme`() {
        assertThat(GameSpend.preview(10, 5, gesture = "relight").gesture).isEqualTo("relight")
    }

    @Test
    fun `les valeurs negatives sont ramenees a zero`() {
        val p = GameSpend.preview(held = -4, cost = -9)
        assertThat(p.held).isEqualTo(0L)
        assertThat(p.cost).isEqualTo(0L)
        assertThat(p.affordable).isTrue()
    }

    @Test
    fun `l'exigence de niveau remplie ou manquante`() {
        val short = GameSpend.requirement(current = 7, required = 10)
        assertThat(short.met).isFalse()
        assertThat(short.missing).isEqualTo(3L)
        val met = GameSpend.requirement(current = 10, required = 10)
        assertThat(met.met).isTrue()
        assertThat(met.missing).isEqualTo(0L)
    }
}

package me.meeshy.ui.component.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ChestViewTest {
    @Test
    fun `ferme le dome est plein et le couvercle leve absent`() {
        val plan = ChestPlan.of(0f)
        assertThat(plan.closedLidAlpha).isEqualTo(1f)
        assertThat(plan.openLidAlpha).isEqualTo(0f)
        assertThat(plan.sparklesAlpha).isEqualTo(0f)
        assertThat(plan.openLidOffsetY).isEqualTo(-3f)
    }

    @Test
    fun `a mi-course les deux couvercles se fondent`() {
        val plan = ChestPlan.of(0.5f)
        assertThat(plan.closedLidAlpha).isEqualTo(0.5f)
        assertThat(plan.openLidAlpha).isEqualTo(0.5f)
        assertThat(plan.sparklesAlpha).isEqualTo(0.5f)
        assertThat(plan.openLidOffsetY).isEqualTo(-1.5f)
    }

    @Test
    fun `ouvert le couvercle est pose et les etincelles pleines`() {
        val plan = ChestPlan.of(1f)
        assertThat(plan.closedLidAlpha).isEqualTo(0f)
        assertThat(plan.openLidAlpha).isEqualTo(1f)
        assertThat(plan.sparklesAlpha).isEqualTo(1f)
        assertThat(plan.openLidOffsetY).isEqualTo(0f)
    }

    @Test
    fun `la progression hors bornes est ramenee dans 0 a 1`() {
        assertThat(ChestPlan.of(-2f)).isEqualTo(ChestPlan.of(0f))
        assertThat(ChestPlan.of(7f)).isEqualTo(ChestPlan.of(1f))
    }
}

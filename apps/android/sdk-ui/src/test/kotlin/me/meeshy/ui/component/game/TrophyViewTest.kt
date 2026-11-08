package me.meeshy.ui.component.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class TrophyViewTest {
    @Test
    fun `une coupe seule tient dans 120 unites sans decalage`() {
        assertThat(TrophyPlan.viewBoxWidth(hasFigures = false)).isEqualTo(120f)
        assertThat(TrophyPlan.cupOffset(hasFigures = false)).isEqualTo(0f)
    }

    @Test
    fun `le Prestige s'elargit a 170 et decale la coupe de 25`() {
        assertThat(TrophyPlan.viewBoxWidth(hasFigures = true)).isEqualTo(170f)
        assertThat(TrophyPlan.cupOffset(hasFigures = true)).isEqualTo(25f)
    }

    @Test
    fun `les deux tenants sont couronnes de part et d'autre de la coupe`() {
        val heads = TrophyPlan.crownHeads()
        assertThat(heads).hasSize(2)
        assertThat(heads[0].x).isEqualTo(30f)
        assertThat(heads[1].x).isEqualTo(140f)
        assertThat(heads[0].y).isWithin(0.001f).of(88f - 60f * 0.27f)
    }

    @Test
    fun `les tenants tiennent dans la boite elargie`() {
        assertThat(TrophyPlan.meo.centerX + TrophyPlan.meo.side / 2).isAtMost(170f)
        assertThat(TrophyPlan.mee.centerX - TrophyPlan.mee.side / 2).isAtLeast(0f)
    }
}

package me.meeshy.ui.component.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameFiguresTest {
    private val mee = GameFigureSlot(centerX = 20f, centerY = 50f, side = 30f)
    private val meo = GameFigureSlot(centerX = 80f, centerY = 50f, side = 30f)

    @Test
    fun `la paire standard est Mee qui sourit et Meo qui salue`() {
        assertThat(GameFigures.standard).isEqualTo(GameFigures("mee-sourire", "meo-salut"))
    }

    @Test
    fun `les boites suivent les coordonnees du dessin mises a l'echelle et Meo est retourne`() {
        val p = GameTenantsGeometry.place(200f, 400f, 100f, mee, meo)!!
        assertThat(p.mee).isEqualTo(GameFigureBox(80f, 200f, 120f))
        assertThat(p.meo).isEqualTo(GameFigureBox(320f, 200f, 120f))
        assertThat(p.meoMirrored).isTrue()
    }

    @Test
    fun `sous la taille du blason les tenants se taisent`() {
        assertThat(GameTenantsGeometry.place(59f, 59f, 100f, mee, meo)).isNull()
        assertThat(GameTenantsGeometry.place(60f, 60f, 100f, mee, meo)).isNotNull()
    }

    @Test
    fun `un dessin sans largeur ne plante pas`() {
        assertThat(GameTenantsGeometry.place(200f, 400f, 0f, mee, meo)).isNull()
    }
}

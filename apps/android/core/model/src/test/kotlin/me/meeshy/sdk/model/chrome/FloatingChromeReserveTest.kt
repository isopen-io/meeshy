package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.layout.PointDp
import org.junit.Test

class FloatingChromeReserveTest {

    private fun layout(feedY: Float, menuY: Float) = FloatingButtonsLayout(PointDp(26f, feedY), PointDp(334f, menuY))

    @Test
    fun `le disque le plus haut de la moitie basse fixe la marge, de son sommet au bas de l'ecran, avec un peu d'air`() {
        assertThat(FloatingChromeReserve.bottomDp(layout(feedY = 600f, menuY = 640f), screenHeight = 740f))
            .isWithin(0.001f).of(740f - (600f - 26f) + FloatingChromeReserve.CLEARANCE)
    }

    @Test
    fun `des disques dans la moitie haute ne reservent rien`() {
        assertThat(FloatingChromeReserve.bottomDp(layout(feedY = 300f, menuY = 360f), screenHeight = 740f)).isEqualTo(0f)
    }

    @Test
    fun `un seul disque en bas suffit a reserver sa zone`() {
        assertThat(FloatingChromeReserve.bottomDp(layout(feedY = 200f, menuY = 600f), screenHeight = 740f))
            .isWithin(0.001f).of(740f - (600f - 26f) + FloatingChromeReserve.CLEARANCE)
    }

    @Test
    fun `une fenetre non mesuree ne reserve rien`() {
        assertThat(FloatingChromeReserve.bottomDp(layout(feedY = 600f, menuY = 640f), screenHeight = 0f)).isEqualTo(0f)
    }
}

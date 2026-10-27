package me.meeshy.sdk.model.chrome

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.layout.PointDp
import org.junit.Test

class FloatingChromeLateralReserveTest {

    private val width = 360f
    private fun layout(feed: PointDp, menu: PointDp) = FloatingButtonsLayout(feed, menu)

    // Recette S8 : fil parqué à gauche vers y=366, menu à droite (x=314) vers y=290.
    private val bands = FloatingChromeLateralReserve.bands(layout(PointDp(26f, 366f), PointDp(334f, 290f)), width)

    @Test
    fun `chaque disque reserve de son cote une bande de sa hauteur, du bord au-dela du disque, avec un peu d'air`() {
        assertThat(bands).hasSize(2)
        val left = bands.single { it.side == FloatingButtonSide.LEADING }
        assertThat(left.top).isWithin(0.001f).of(366f - 26f)
        assertThat(left.bottom).isWithin(0.001f).of(366f + 26f)
        assertThat(left.reach).isWithin(0.001f).of(26f + 26f + FloatingChromeLateralReserve.CLEARANCE)
        val right = bands.single { it.side == FloatingButtonSide.TRAILING }
        assertThat(right.reach).isWithin(0.001f).of(360f - (334f - 26f) + FloatingChromeLateralReserve.CLEARANCE)
    }

    @Test
    fun `une rangee a la hauteur d'un disque recoit la marge de son cote seulement`() {
        val insets = FloatingChromeLateralReserve.insets(bands, rowTop = 270f, rowBottom = 330f)
        assertThat(insets.leading).isEqualTo(0f)
        assertThat(insets.trailing).isGreaterThan(0f)
    }

    @Test
    fun `une rangee qui effleure le disque par un bord est reservee, une rangee au-dessus ou au-dessous ne l'est pas`() {
        val touching = FloatingChromeLateralReserve.insets(bands, rowTop = 300f, rowBottom = 400f)
        assertThat(touching.leading).isGreaterThan(0f)
        assertThat(touching.trailing).isGreaterThan(0f)
        val clear = FloatingChromeLateralReserve.insets(bands, rowTop = 0f, rowBottom = 100f)
        assertThat(clear).isEqualTo(FloatingChromeLateralReserve.Insets.None)
        val below = FloatingChromeLateralReserve.insets(bands, rowTop = 500f, rowBottom = 560f)
        assertThat(below).isEqualTo(FloatingChromeLateralReserve.Insets.None)
    }

    @Test
    fun `deux disques du meme cote donnent la plus grande portee`() {
        val both = FloatingChromeLateralReserve.bands(layout(PointDp(26f, 300f), PointDp(40f, 360f)), width)
        val insets = FloatingChromeLateralReserve.insets(both, rowTop = 300f, rowBottom = 360f)
        assertThat(insets.leading).isWithin(0.001f).of(40f + 26f + FloatingChromeLateralReserve.CLEARANCE)
    }

    @Test
    fun `une largeur non mesuree ne reserve rien`() {
        assertThat(FloatingChromeLateralReserve.bands(layout(PointDp(26f, 300f), PointDp(334f, 360f)), 0f)).isEmpty()
    }

    @Test
    fun `une rangee deja en retrait du bord ne cede que le complement, jamais une marge negative`() {
        val left = bands.single { it.side == FloatingButtonSide.LEADING }
        val inset = FloatingChromeLateralReserve.insets(bands, rowTop = 340f, rowBottom = 390f, startGap = 16f)
        assertThat(inset.leading).isWithin(0.001f).of(left.reach - 16f)
        val farInside = FloatingChromeLateralReserve.insets(bands, rowTop = 340f, rowBottom = 390f, startGap = 200f)
        assertThat(farInside.leading).isEqualTo(0f)
    }

    @Test
    fun `une rangee qui commence juste sous le disque, sans passer dessous, garde toute sa largeur`() {
        val justBelowMenu = FloatingChromeLateralReserve.insets(bands, rowTop = 290f + 26f + 2f, rowBottom = 330f)
        assertThat(justBelowMenu.trailing).isEqualTo(0f)
    }

    @Test
    fun `une rangee etroite touchee des deux cotes ne cede que le cote du disque qui la touche le plus haut`() {
        // Recette S8 : menu à droite (264…316), fil à gauche (340…392), notification de 300 à 420.
        val narrow = FloatingChromeLateralReserve.insets(bands, rowTop = 300f, rowBottom = 420f, rowWidth = 360f)
        assertThat(narrow.leading).isEqualTo(0f)
        assertThat(narrow.trailing).isGreaterThan(0f)
        val wide = FloatingChromeLateralReserve.insets(bands, rowTop = 300f, rowBottom = 420f, rowWidth = 800f)
        assertThat(wide.leading).isGreaterThan(0f)
        assertThat(wide.trailing).isGreaterThan(0f)
    }

    @Test
    fun `le cote choisi ne depend pas de la hauteur de la rangee`() {
        val short = FloatingChromeLateralReserve.insets(bands, rowTop = 300f, rowBottom = 350f, rowWidth = 360f)
        val tall = FloatingChromeLateralReserve.insets(bands, rowTop = 300f, rowBottom = 600f, rowWidth = 360f)
        assertThat(short).isEqualTo(tall)
    }
}

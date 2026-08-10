package me.meeshy.sdk.model.chrome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FloatingMenuGeometryTest {

    // Le menu se deploie du cote ou il y a de la place : bouton en bas -> vers le
    // haut, bouton en haut -> vers le bas. C'est la position VERTICALE du bouton qui
    // decide, pas un cote fixe — sinon un bouton remonte en haut de l'ecran verrait
    // son menu sortir du viewport.
    @Test
    fun `the menu unfolds upward when the button sits in the bottom half`() {
        assertTrue(menuUnfoldsUpward(FloatingButtonPosition.DEFAULT_RIGHT))
        assertTrue(menuUnfoldsUpward(FloatingButtonPosition(1f, 0.51f)))
        assertFalse(menuUnfoldsUpward(FloatingButtonPosition(1f, 0.2f)))
        assertFalse(menuUnfoldsUpward(FloatingButtonPosition.TOP_RIGHT))
    }

    // Les items s'etendent vers l'INTERIEUR de l'ecran : bouton colle a droite ->
    // libelles a gauche des pastilles ; bouton colle a gauche -> libelles a droite.
    @Test
    fun `the menu grows toward the screen interior`() {
        assertTrue(menuGrowsRightward(FloatingButtonPosition.DEFAULT_LEFT))
        assertFalse(menuGrowsRightward(FloatingButtonPosition.DEFAULT_RIGHT))
    }

    // Ancre en bas a droite (defaut) : le menu s'aligne sur le bord DROIT de l'ancre
    // et se pose AU-DESSUS d'elle, entierement visible.
    @Test
    fun `anchored bottom-right the menu sits above and right-aligned`() {
        val offset = menuPopupOffset(
            anchor = MenuAnchorBounds(left = 920, top = 1800, right = 1060, bottom = 1940),
            menuWidthPx = 600,
            menuHeightPx = 900,
            windowWidthPx = 1080,
            windowHeightPx = 2200,
            spacingPx = 20,
        )
        assertEquals(1060 - 600, offset.xPx)
        assertEquals(1800 - 20 - 900, offset.yPx)
    }

    // Ancre en haut a gauche : le menu s'aligne sur le bord GAUCHE et se pose SOUS
    // l'ancre.
    @Test
    fun `anchored top-left the menu sits below and left-aligned`() {
        val offset = menuPopupOffset(
            anchor = MenuAnchorBounds(left = 20, top = 100, right = 160, bottom = 240),
            menuWidthPx = 600,
            menuHeightPx = 900,
            windowWidthPx = 1080,
            windowHeightPx = 2200,
            spacingPx = 20,
        )
        assertEquals(20, offset.xPx)
        assertEquals(240 + 20, offset.yPx)
    }

    // Quoi qu'il arrive, le menu reste DANS la fenetre : un menu plus haut que
    // l'espace disponible est ramene au bord plutot que coupe hors viewport.
    @Test
    fun `the menu never leaves the window`() {
        // Ancre au milieu de l'ecran, menu enorme : clamp aux deux bords.
        val offset = menuPopupOffset(
            anchor = MenuAnchorBounds(left = 900, top = 1000, right = 1040, bottom = 1140),
            menuWidthPx = 1200,
            menuHeightPx = 2600,
            windowWidthPx = 1080,
            windowHeightPx = 2200,
            spacingPx = 20,
        )
        assertEquals(0, offset.xPx)
        assertEquals(0, offset.yPx)
    }

    // Un menu qui depasserait par le bas (ancre haute, menu haut) est ramene pour
    // finir au ras du bord bas, jamais au-dela.
    @Test
    fun `a downward menu overflowing the bottom is pulled back inside`() {
        val offset = menuPopupOffset(
            anchor = MenuAnchorBounds(left = 0, top = 100, right = 140, bottom = 240),
            menuWidthPx = 400,
            menuHeightPx = 2100,
            windowWidthPx = 1080,
            windowHeightPx = 2200,
            spacingPx = 20,
        )
        assertEquals(2200 - 2100, offset.yPx)
    }
}

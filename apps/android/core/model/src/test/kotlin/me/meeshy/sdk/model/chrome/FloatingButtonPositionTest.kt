package me.meeshy.sdk.model.chrome

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FloatingButtonPositionTest {

    @Test
    fun `snaps to the nearest horizontal edge`() {
        assertEquals(0f, snapToNearestEdge(FloatingButtonPosition(0.3f, 0.5f)).x, 0.001f)
        assertEquals(1f, snapToNearestEdge(FloatingButtonPosition(0.7f, 0.5f)).x, 0.001f)
    }

    // Seul X est aimante : l'utilisateur choisit la HAUTEUR qui tombe sous son
    // pouce, le bord n'etant qu'un ancrage. Aimanter Y aussi renverrait le bouton
    // dans un coin a chaque relachement.
    @Test
    fun `snapping preserves the vertical position`() {
        assertEquals(0.42f, snapToNearestEdge(FloatingButtonPosition(0.9f, 0.42f)).y, 0.001f)
    }

    @Test
    fun `clamps out-of-bounds values into 0-1`() {
        val clamped = clampToBounds(FloatingButtonPosition(-3f, 12f))
        assertEquals(0f, clamped.x, 0.001f)
        assertEquals(1f, clamped.y, 0.001f)
    }

    @Test
    fun `a decoded position round-trips through encoding`() {
        val original = FloatingButtonPosition(0.25f, 0.75f)
        assertEquals(original, decodePosition(encodePosition(original), FloatingButtonPosition.DEFAULT_LEFT))
    }

    // Une preference illisible ne doit pas faire disparaitre le bouton principal
    // de navigation : elle degrade vers la position par defaut.
    @Test
    fun `a corrupt stored value degrades to the fallback`() {
        val fallback = FloatingButtonPosition.DEFAULT_RIGHT
        assertEquals(fallback, decodePosition("nawak", fallback))
        assertEquals(fallback, decodePosition(null, fallback))
        assertEquals(fallback, decodePosition("0.5", fallback))
        assertEquals(fallback, decodePosition("abc,def", fallback))
        assertEquals(fallback, decodePosition("", fallback))
    }

    // Hors bornes en base = valeur ecrite par une version anterieure, ou corrompue.
    // On la ramene dans l'ecran plutot que de la rejeter : la position reste
    // approximativement celle voulue.
    @Test
    fun `a decoded out-of-bounds value is clamped, not rejected`() {
        assertEquals(
            FloatingButtonPosition(1f, 0f),
            decodePosition("5.0,-2.0", FloatingButtonPosition.DEFAULT_LEFT),
        )
    }

    // NaN passe toFloatOrNull mais rendrait le bouton impossible a placer.
    @Test
    fun `NaN degrades to the fallback rather than reaching the layout`() {
        val fallback = FloatingButtonPosition.DEFAULT_LEFT
        assertEquals(fallback, decodePosition("NaN,0.5", fallback))
        assertEquals(fallback, decodePosition("0.5,NaN", fallback))
    }

    @Test
    fun `isLeft and isTop split the screen at the midpoint`() {
        assertTrue(FloatingButtonPosition(0.2f, 0.2f).isLeft)
        assertTrue(FloatingButtonPosition(0.2f, 0.2f).isTop)
        assertFalse(FloatingButtonPosition(0.8f, 0.8f).isLeft)
        assertFalse(FloatingButtonPosition(0.8f, 0.8f).isTop)
    }

    // Parite iOS : le Flux a gauche, le Menu a droite.
    @Test
    fun `defaults put feed on the left and menu on the right`() {
        assertTrue(FloatingButtonPosition.DEFAULT_LEFT.isLeft)
        assertFalse(FloatingButtonPosition.DEFAULT_RIGHT.isLeft)
    }
}

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

/**
 * Le deplacement lui-meme : convertir un delta en PIXELS, tel que le systeme de
 * gestes le fournit, en position NORMALISEE.
 *
 * Extrait du composable pour etre verifiable sans instrumentation — le projet n'a
 * aucune infrastructure de test Compose, et l'introduire pour ce lot depasserait
 * son perimetre. Toute la logique vit donc ici, le composable ne faisant plus que
 * dessiner et deleguer.
 */
class FloatingButtonDragTest {

    @Test
    fun `a pixel delta becomes a normalised offset`() {
        val moved = applyDragDelta(
            current = FloatingButtonPosition(0f, 0.5f),
            deltaXPx = 100f, deltaYPx = 0f,
            travelXPx = 1000f, travelYPx = 2000f,
        )
        assertEquals(0.1f, moved.x, 0.001f)
        assertEquals(0.5f, moved.y, 0.001f)
    }

    @Test
    fun `dragging past the edge is clamped, never off-screen`() {
        val moved = applyDragDelta(
            current = FloatingButtonPosition(0.9f, 0.9f),
            deltaXPx = 5000f, deltaYPx = 5000f,
            travelXPx = 1000f, travelYPx = 2000f,
        )
        assertEquals(1f, moved.x, 0.001f)
        assertEquals(1f, moved.y, 0.001f)
    }

    // Ecran mesure a zero (premiere composition, ou fenetre repliee): diviser par
    // le parcours ferait une division par zero et propagerait NaN jusqu'au layout.
    @Test
    fun `a zero travel axis leaves the position untouched instead of producing NaN`() {
        val current = FloatingButtonPosition(0.3f, 0.4f)
        val moved = applyDragDelta(current, deltaXPx = 50f, deltaYPx = 50f, travelXPx = 0f, travelYPx = 0f)
        assertEquals(current, moved)
    }

    // --- migration de l'ancien format (x,y) vers la place cote + hauteur ---------------

    @Test
    fun `a value written by the previous Android build is read as the legacy x,y form`() {
        val stored = FloatingButtonStoredPosition.parse(encodePosition(FloatingButtonPosition(0f, 0.82f)))
        assertEquals(FloatingButtonStoredPosition.Legacy(0f, 0.82f), stored)
    }

    @Test
    fun `a legacy value keeps its side and lands where the old bands put it`() {
        val geometry = FloatingButtonGeometry(400f, 800f, me.meeshy.sdk.model.layout.EdgeInsetsDp.Zero)
        val left = geometry.centerForStorage("0.0,0.82", FloatingButtonGeometry.DEFAULT_FEED_STORAGE)
        val right = geometry.centerForStorage("1.0,0.0", FloatingButtonGeometry.DEFAULT_MENU_STORAGE)
        assertEquals(geometry.x(FloatingButtonSide.LEADING), left.x, 0.001f)
        assertEquals(272f + (664f - 272f) * 0.82f, left.y, 0.01f)
        assertEquals(geometry.x(FloatingButtonSide.TRAILING), right.x, 0.001f)
        assertEquals(272f, right.y, 0.001f)
    }

    @Test
    fun `an out of range legacy value is clamped, never rejected`() {
        assertEquals(FloatingButtonStoredPosition.Legacy(1f, 0f), FloatingButtonStoredPosition.parse("1.5,-2"))
    }

    @Test
    fun `a legacy value in scientific notation is still read`() {
        assertEquals(FloatingButtonStoredPosition.Legacy(1.0E-4f, 1f), FloatingButtonStoredPosition.parse("1.0E-4,1.0"))
    }

    @Test
    fun `a corrupt value is not a position`() {
        assertEquals(null, FloatingButtonStoredPosition.parse("garbage"))
        assertEquals(null, FloatingButtonStoredPosition.parse(null))
        assertEquals(null, FloatingButtonStoredPosition.parse("NaN,0.5"))
        assertEquals(null, FloatingButtonStoredPosition.parse("v3,Z,0.5"))
    }
}

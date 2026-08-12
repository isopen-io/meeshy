package me.meeshy.sdk.chrome

import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.chrome.FloatingButtonPosition
import org.junit.Assert.assertEquals
import org.junit.Test

class FloatingButtonPositionStoreTest {

    // Parite iOS : le Flux a gauche, le Menu a droite.
    @Test
    fun `defaults mirror iOS - feed on the left, menu on the right`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        assertEquals(FloatingButtonPosition.DEFAULT_LEFT, store.leftPosition.value)
        assertEquals(FloatingButtonPosition.DEFAULT_RIGHT, store.rightPosition.value)
    }

    @Test
    fun `a written position is read back`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        val moved = FloatingButtonPosition(0f, 0.2f)
        store.setLeftPosition(moved)
        assertEquals(moved, store.leftPosition.value)
    }

    // Chaque bouton a sa propre cle : deplacer l'un ne doit pas repositionner
    // l'autre, sinon ranger le menu deplacerait le flux avec lui.
    @Test
    fun `the two buttons hold independent positions`() = runTest {
        val store = InMemoryFloatingButtonPositionStore()
        store.setLeftPosition(FloatingButtonPosition(0f, 0.1f))
        assertEquals(FloatingButtonPosition.DEFAULT_RIGHT, store.rightPosition.value)

        store.setRightPosition(FloatingButtonPosition(1f, 0.9f))
        assertEquals(FloatingButtonPosition(0f, 0.1f), store.leftPosition.value)
    }
}

package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La colonne en édition est une PILE de niveaux (#13956, grammaire d'édition #13973) : le premier porte les options de
 * l'objet, chaque réglage plus fin se pose par-dessus, et Retour descend d'un seul niveau, jamais sous le premier.
 */
class ComposerRailStackTest {

    private enum class Level { OPTIONS, LOOK, FILTER }

    @Test
    fun `a fresh stack shows its first level and has nothing to go back to`() {
        val stack = ComposerRailStack(Level.OPTIONS)

        assertThat(stack.top).isEqualTo(Level.OPTIONS)
        assertThat(stack.depth).isEqualTo(1)
        assertThat(stack.canGoBack).isFalse()
    }

    @Test
    fun `a finer level lays over the one below, level after level`() {
        val stack = ComposerRailStack(Level.OPTIONS).pushed(Level.LOOK).pushed(Level.FILTER)

        assertThat(stack.top).isEqualTo(Level.FILTER)
        assertThat(stack.depth).isEqualTo(3)
        assertThat(stack.canGoBack).isTrue()
    }

    @Test
    fun `back goes down one level only`() {
        val stack = ComposerRailStack(Level.OPTIONS).pushed(Level.LOOK).pushed(Level.FILTER).popped()

        assertThat(stack.top).isEqualTo(Level.LOOK)
        assertThat(stack.depth).isEqualTo(2)
    }

    @Test
    fun `back never goes under the first level`() {
        val stack = ComposerRailStack(Level.OPTIONS).popped().popped()

        assertThat(stack.top).isEqualTo(Level.OPTIONS)
        assertThat(stack.depth).isEqualTo(1)
    }

    @Test
    fun `opening the level already on top lays nothing more`() {
        val stack = ComposerRailStack(Level.OPTIONS).pushed(Level.LOOK).pushed(Level.LOOK)

        assertThat(stack.depth).isEqualTo(2)
        assertThat(ComposerRailStack(Level.OPTIONS).pushed(Level.OPTIONS).depth).isEqualTo(1)
    }
}

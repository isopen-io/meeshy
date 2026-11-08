package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class RoomsToRejoinTest {
    @Test
    fun `la conversation active est rejointe d'abord, puis les ouvertes triees, puis le reste`() {
        val order = RoomsToRejoin.order(
            joined = setOf("z", "c", "b", "a", "d"),
            active = "c",
            open = setOf("b", "a", "c"),
        )
        assertThat(order).containsExactly("c", "a", "b", "d", "z").inOrder()
    }

    @Test
    fun `une active non memorisee n'est pas rejouee et aucune salle n'apparait deux fois`() {
        val order = RoomsToRejoin.order(joined = setOf("a", "b"), active = "x", open = setOf("a", "x"))
        assertThat(order).containsExactly("a", "b").inOrder()
        assertThat(order).containsNoDuplicates()
    }

    @Test
    fun `sans active les ouvertes passent devant le reste`() {
        assertThat(RoomsToRejoin.order(setOf("a", "b", "c"), null, setOf("c"))).containsExactly("c", "a", "b").inOrder()
    }

    @Test
    fun `aucune salle memorisee donne une liste vide`() {
        assertThat(RoomsToRejoin.order(emptySet(), "a", setOf("a"))).isEmpty()
    }
}

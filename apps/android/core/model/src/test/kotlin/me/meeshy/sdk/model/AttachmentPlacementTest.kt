package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AttachmentPlacementTest {
    private fun finish(order: List<Int>): List<Int> {
        val selection = listOf(3, 1, 5, 2, 4)
        val selectedBefore = selection.mapIndexed { i, id -> id to selection.take(i).map { it.toString() }.toSet() }.toMap()
        return order.fold(emptyList<Int>()) { zone, id ->
            val present = (zone.map { it.toString() }).toSet()
            // Ce qui est déjà dans la zone ou encore en préparation précède : seuls les choisis avant.
            AttachmentPlacement.place(zone, id, selectedBefore.getValue(id)) { it.toString() }
                .also { assertThat(present).doesNotContain(id.toString()) }
        }
    }

    @Test fun `selection 3 1 5 2 4 garde l'ordre meme si 4 finit le premier`() {
        assertThat(finish(listOf(4, 3, 1, 5, 2))).containsExactly(3, 1, 5, 2, 4).inOrder()
    }

    @Test fun `l'ordre de fin inverse donne le meme ordre de selection`() {
        assertThat(finish(listOf(4, 2, 5, 1, 3))).containsExactly(3, 1, 5, 2, 4).inOrder()
    }

    @Test fun `une pièce sans predecesseur en zone prend la tete`() {
        assertThat(AttachmentPlacement.indexFor(listOf("x", "y"), emptySet())).isEqualTo(0)
    }

    @Test fun `un predecesseur retire n'est pas compte`() {
        assertThat(AttachmentPlacement.indexFor(listOf("a", "c"), setOf("a", "b"))).isEqualTo(1)
    }
}

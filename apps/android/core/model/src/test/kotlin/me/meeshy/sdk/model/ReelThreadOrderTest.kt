package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelThreadOrderTest {
    private data class Item(val id: String, val rev: Int = 0)

    private fun items(vararg ids: String) = ids.map { Item(it) }
    private val idOf: (Item) -> String = { it.id }

    @Test
    fun `une relecture garde le reel regarde et ses predecesseurs`() {
        val result = ReelThreadOrder.refreshed(items("a", "b", "c"), "b", items("c", "b", "a", "d"), idOf)
        assertThat(result.map { it.id }).containsExactly("a", "b", "c", "d").inOrder()
    }

    @Test
    fun `les reels gardes prennent la donnee la plus recente`() {
        val served = listOf(Item("b", 2), Item("x"))
        val result = ReelThreadOrder.refreshed(items("a", "b"), "b", served, idOf)
        assertThat(result).containsExactly(Item("a"), Item("b", 2), Item("x")).inOrder()
    }

    @Test
    fun `sans ancre connue on prend le service dedoublonne`() {
        val served = items("z", "y", "z")
        assertThat(ReelThreadOrder.refreshed(items("a"), "ghost", served, idOf).map { it.id })
            .containsExactly("z", "y").inOrder()
        assertThat(ReelThreadOrder.refreshed(items("a"), null, served, idOf).map { it.id })
            .containsExactly("z", "y").inOrder()
    }

    @Test
    fun `une page de plus s ajoute en queue dedoublonnee`() {
        val result = ReelThreadOrder.appended(items("a", "b"), items("b", "c", "c"), idOf)
        assertThat(result.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `la portee de prechargement borne autour de l ancre`() {
        val ids = (0..9).map { "r$it" }
        val scope = ReelThreadOrder.preloadScope(ids, "r5", radius = 2)
        assertThat(scope.anchorId).isEqualTo("r5")
        assertThat(scope.neighbours).containsExactly("r3", "r4", "r5", "r6", "r7").inOrder()
        assertThat(ReelThreadOrder.preloadScope(ids, "r0", radius = 2).neighbours)
            .containsExactly("r0", "r1", "r2").inOrder()
        assertThat(ReelThreadOrder.preloadScope(ids, "ghost").neighbours).isEmpty()
        assertThat(ReelThreadOrder.preloadScope(ids, "r5", radius = -3).neighbours).containsExactly("r5")
    }
}

package me.meeshy.sdk.model.chatlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LocalIdServerIdTableTest {

    private fun table() = LocalIdServerIdTable.of(
        listOf(MessageRowIds("local-1", "srv-1"), MessageRowIds("local-2", null), MessageRowIds("srv-3", "srv-3")),
    )

    @Test
    fun `un id serveur se resout vers la cle locale de la bulle optimiste`() {
        assertThat(table().localIdFor("srv-1")).isEqualTo("local-1")
    }

    @Test
    fun `un id inconnu ou non accuse reste sa propre cle`() {
        assertThat(table().localIdFor("local-2")).isEqualTo("local-2")
        assertThat(table().localIdFor("srv-9")).isEqualTo("srv-9")
    }

    @Test
    fun `localIdsFor traduit un ensemble sans doublon`() {
        assertThat(table().localIdsFor(setOf("srv-1", "local-1", "local-2"))).containsExactly("local-1", "local-2")
    }

    @Test
    fun `le jumeau serveur d une ligne optimiste accusee ne duplique pas la bulle`() {
        val rows = listOf(MessageRowIds("local-1", "srv-1"), MessageRowIds("srv-1", null), MessageRowIds("x", null))
        val kept = LocalIdServerIdTable.collapseTwins(rows) { it }
        assertThat(kept.map { it.localId }).containsExactly("local-1", "x").inOrder()
    }

    @Test
    fun `sans jumeau la liste est inchangee`() {
        val rows = listOf(MessageRowIds("a", "a"), MessageRowIds("b", null))
        assertThat(LocalIdServerIdTable.collapseTwins(rows) { it }).isEqualTo(rows)
    }

    @Test
    fun `une suppression sous la fenetre decale la position de lecture`() {
        val previous = listOf("n1", "n2", "n3", "n4", "n5")
        val next = listOf("n1", "n3", "n4", "n5")
        assertThat(DeletionCompensation.firstVisibleIndexAfter(previous, next, firstVisibleIndex = 3)).isEqualTo(2)
    }

    @Test
    fun `une suppression au dessus de la fenetre ne change rien`() {
        val previous = listOf("n1", "n2", "n3", "n4")
        val next = listOf("n1", "n2", "n3")
        assertThat(DeletionCompensation.firstVisibleIndexAfter(previous, next, firstVisibleIndex = 2)).isEqualTo(2)
    }

    @Test
    fun `en bas de liste aucune compensation`() {
        assertThat(DeletionCompensation.firstVisibleIndexAfter(listOf("a", "b"), listOf("b"), 0)).isEqualTo(0)
    }
}

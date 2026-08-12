package me.meeshy.sdk.model.search

import org.junit.Assert.assertEquals
import org.junit.Test

class RecentSearchesTest {

    // Une nouvelle recherche entre EN TETE : les recents se lisent du plus frais
    // au plus ancien (parite iOS globalSearch.recentSearches).
    @Test
    fun `a new query is inserted at the head`() {
        assertEquals(listOf("belva", "windie"), RecentSearches.add(listOf("windie"), "belva"))
    }

    // Re-chercher un terme deja present le REMONTE au lieu de le dupliquer —
    // insensible a la casse, et c'est la NOUVELLE graphie qui est gardee.
    @Test
    fun `re-searching an existing term moves it to the head without duplicating`() {
        assertEquals(
            listOf("Belva", "windie"),
            RecentSearches.add(listOf("windie", "belva"), "Belva"),
        )
    }

    // Le blanc et les espaces ne polluent jamais l'historique.
    @Test
    fun `blank queries leave the history untouched`() {
        assertEquals(listOf("a"), RecentSearches.add(listOf("a"), "   "))
        assertEquals(listOf("a", "b"), RecentSearches.add(listOf("a", "b"), ""))
    }

    // L'historique est plafonne : le plus ancien tombe quand la tete entre.
    @Test
    fun `the history is capped at the max, dropping the oldest`() {
        val full = (1..RecentSearches.MAX).map { "q$it" }
        val next = RecentSearches.add(full, "fresh")
        assertEquals(RecentSearches.MAX, next.size)
        assertEquals("fresh", next.first())
        assertEquals(false, next.contains("q${RecentSearches.MAX}"))
    }

    // La suppression unitaire est insensible a la casse, comme la dedup.
    @Test
    fun `removal matches case-insensitively`() {
        assertEquals(listOf("windie"), RecentSearches.remove(listOf("Belva", "windie"), "belva"))
    }
}

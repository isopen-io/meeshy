package me.meeshy.sdk.search

import me.meeshy.sdk.model.ApiMessage
import org.junit.Assert.assertEquals
import org.junit.Test

class GlobalSearchLogicTest {

    private fun hit(id: String, createdAt: String?, conversationTitle: String = "conv") =
        MessageSearchHit(
            message = ApiMessage(id = id, conversationId = "c1", createdAt = createdAt),
            conversationTitle = conversationTitle,
        )

    // L'onglet Messages agrege N recherches par conversation : le tri final est
    // chronologique DESCENDANT toutes conversations confondues, pas groupe par
    // conversation — parite iOS GlobalSearchViewModel.performSearch.
    @Test
    fun `merged message hits are sorted newest first across conversations`() {
        val merged = mergeMessageHits(
            listOf(
                listOf(hit("a", "2026-08-01T10:00:00Z"), hit("b", "2026-08-03T10:00:00Z")),
                listOf(hit("c", "2026-08-02T10:00:00Z")),
            ),
        )
        assertEquals(listOf("b", "c", "a"), merged.map { it.message.id })
    }

    // Un meme message revenu par deux chemins (pagination, doublon serveur) ne doit
    // apparaitre qu'une fois — dedup par id, premiere occurrence gardee.
    @Test
    fun `merged message hits are deduplicated by message id`() {
        val merged = mergeMessageHits(
            listOf(
                listOf(hit("a", "2026-08-01T10:00:00Z", conversationTitle = "first")),
                listOf(hit("a", "2026-08-01T10:00:00Z", conversationTitle = "second")),
            ),
        )
        assertEquals(1, merged.size)
        assertEquals("first", merged.first().conversationTitle)
    }

    // Un createdAt absent ne doit pas faire planter le tri : ces messages tombent
    // en fin de liste plutot que d'exclure le resultat.
    @Test
    fun `hits without a timestamp sink to the end instead of crashing`() {
        val merged = mergeMessageHits(
            listOf(listOf(hit("x", null), hit("y", "2026-08-02T10:00:00Z"))),
        )
        assertEquals(listOf("y", "x"), merged.map { it.message.id })
    }
}

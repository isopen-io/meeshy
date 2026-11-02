package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CachePurgeStructuralLimitsTest {

    private val grid = CacheDataKind.entries.flatMap { k -> CacheDomain.entries.map { k to it } }

    @Test
    fun `la grille compte 28 croisements chacun avec un seul verdict`() {
        assertThat(grid).hasSize(28)
        grid.forEach { (k, d) ->
            val verdict = CachePurgeStructuralLimits.availability(k, d, 10L)
            assertThat(verdict.isPurgeable).isEqualTo(CachePurgeStructuralLimits.limitation(k, d) == null)
        }
    }

    @Test
    fun `documents n ont aucun stockage dedie`() {
        CacheDomain.entries.forEach {
            assertThat(CachePurgeStructuralLimits.limitation(CacheDataKind.DOCUMENTS, it))
                .isEqualTo(CachePurgeLimitation.NO_DEDICATED_STORE)
        }
    }

    @Test
    fun `reactions et donnees sont integrees au contenu sauf les donnees mesurables`() {
        CacheDomain.entries.forEach {
            assertThat(CachePurgeStructuralLimits.limitation(CacheDataKind.REACTIONS, it))
                .isEqualTo(CachePurgeLimitation.EMBEDDED_IN_PAYLOAD)
        }
    }

    @Test
    fun `donnees des reels sont indissociables des publications`() {
        assertThat(CachePurgeStructuralLimits.limitation(CacheDataKind.PAYLOADS, CacheDomain.REELS))
            .isEqualTo(CachePurgeLimitation.INDIVISIBLE_FROM_POSTS)
        assertThat(CachePurgeStructuralLimits.isMeasurable(CacheDataKind.PAYLOADS, CacheDomain.POSTS)).isTrue()
    }

    @Test
    fun `messages hors conversations sont non applicables`() {
        listOf(CacheDomain.POSTS, CacheDomain.REELS, CacheDomain.STORIES).forEach {
            assertThat(CachePurgeStructuralLimits.limitation(CacheDataKind.MESSAGES, it))
                .isEqualTo(CachePurgeLimitation.NOT_APPLICABLE)
        }
        assertThat(CachePurgeStructuralLimits.isMeasurable(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS)).isTrue()
    }

    @Test
    fun `les medias sont mesurables dans tous les domaines`() {
        CacheDataKind.entries.filter { it.isMedia }.forEach { k ->
            CacheDomain.entries.forEach { assertThat(CachePurgeStructuralLimits.isMeasurable(k, it)).isTrue() }
        }
    }

    @Test
    fun `une limite ne porte aucun octet et n est jamais purgeable`() {
        val a = CachePurgeStructuralLimits.availability(CacheDataKind.DOCUMENTS, CacheDomain.POSTS, 999L)
        assertThat(a.bytes).isEqualTo(0L)
        assertThat(a.isPurgeable).isFalse()
    }
}

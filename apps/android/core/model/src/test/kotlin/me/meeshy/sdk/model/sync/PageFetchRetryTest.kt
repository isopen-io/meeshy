package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PageFetchRetryTest {

    @Test
    fun `un total de 1050 avec une page de 100 planifie les pages 1 a 10`() {
        assertThat(PageFetchPlan.remainingPageIndices(total = 1050, firstPageCount = 100))
            .containsExactlyElementsIn(1..10).inOrder()
    }

    @Test
    fun `une page 1 qui contient tout ne planifie rien`() {
        assertThat(PageFetchPlan.remainingPageIndices(total = 100, firstPageCount = 100)).isEmpty()
    }

    @Test
    fun `sans total annonce il n y a pas de plan parallele`() {
        assertThat(PageFetchPlan.remainingPageIndices(total = null, firstPageCount = 100)).isEmpty()
    }

    @Test
    fun `le pas suit la page reellement rendue quand le serveur plafonne sous la taille demandee`() {
        val pages = PageFetchPlan.remainingPageIndices(total = 200, firstPageCount = 50)
        assertThat(pages).containsExactly(1, 2, 3).inOrder()
        assertThat(PageFetchPlan.offsetOf(3, PageFetchPlan.stride(50))).isEqualTo(150)
    }

    @Test
    fun `une page 1 vide garde un pas d un seul pour ne pas boucler`() {
        assertThat(PageFetchPlan.stride(0)).isEqualTo(1)
    }

    @Test
    fun `le plan est plafonne au nombre maximal de pages`() {
        assertThat(PageFetchPlan.remainingPageIndices(total = 1_000_000, firstPageCount = 100)).hasSize(PageFetchPlan.MAX_PAGES - 1)
    }

    @Test
    fun `chaque page est tentee trois fois avec une attente de 1 puis 2 secondes`() {
        assertThat(PageFetchPlan.shouldRetry(0)).isTrue()
        assertThat(PageFetchPlan.shouldRetry(1)).isTrue()
        assertThat(PageFetchPlan.shouldRetry(2)).isFalse()
        assertThat(PageFetchPlan.retryDelayMillis(0)).isEqualTo(1_000L)
        assertThat(PageFetchPlan.retryDelayMillis(1)).isEqualTo(2_000L)
    }

    @Test
    fun `les pages perdues sont celles que le parallele n a pas livrees`() {
        assertThat(PageFetchPlan.droppedPages(listOf(1, 2, 3, 4), fetched = setOf(1, 3))).containsExactly(2, 4).inOrder()
    }

    @Test
    fun `la queue avance de ce que la page a rendu et s arrete sur la parole du serveur`() {
        val next = PageFetchPlan.advance(PageFetchPlan.Tail(offset = 100, hasMore = true), returned = 100, newItems = 100, backendHasMore = false)
        assertThat(next.offset).isEqualTo(200)
        assertThat(next.hasMore).isFalse()
        assertThat(next.iterations).isEqualTo(1)
    }

    @Test
    fun `sans parole du serveur une page pleine laisse supposer une suite`() {
        val full = PageFetchPlan.advance(PageFetchPlan.Tail(0, true), returned = 100, newItems = 100, backendHasMore = null)
        val partial = PageFetchPlan.advance(PageFetchPlan.Tail(0, true), returned = 40, newItems = 40, backendHasMore = null)
        assertThat(full.hasMore).isTrue()
        assertThat(partial.hasMore).isFalse()
    }

    @Test
    fun `une page sans ligne nouvelle arrete la queue meme si le serveur annonce une suite`() {
        val replayed = PageFetchPlan.advance(PageFetchPlan.Tail(0, true), returned = 100, newItems = 0, backendHasMore = true)
        assertThat(replayed.hasMore).isFalse()
    }

    @Test
    fun `la queue est bornee a 50 iterations`() {
        val tail = generateSequence(PageFetchPlan.Tail(0, true)) {
            PageFetchPlan.advance(it, returned = 100, newItems = 100, backendHasMore = true)
        }.takeWhile { it.canContinue }.toList()
        assertThat(tail).hasSize(PageFetchPlan.MAX_TAIL_ITERATIONS)
        val last = PageFetchPlan.advance(tail.last(), 100, 100, true)
        assertThat(last.canContinue).isFalse()
        assertThat(last.hitCeiling).isTrue()
    }
}

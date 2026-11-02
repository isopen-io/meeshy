package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CachePurgeSelectionTest {

    private fun id(k: CacheDataKind, d: CacheDomain) = CachePurgeCellId(k, d)
    private val imgPosts = id(CacheDataKind.IMAGES, CacheDomain.POSTS)
    private val imgStories = id(CacheDataKind.IMAGES, CacheDomain.STORIES)
    private val vidPosts = id(CacheDataKind.VIDEOS, CacheDomain.POSTS)

    private fun report(unattributed: Long = 0L, imgStoriesBytes: Long = 50L) = CachePurgeReport.of(
        mapOf(imgPosts to 100L, imgStories to imgStoriesBytes, vidPosts to 400L),
        unattributed,
        550L + unattributed,
    )

    @Test
    fun `cocher puis decocher une case`() {
        val r = report()
        val on = CachePurgeSelection().toggle(imgPosts, r)
        assertThat(on.isSelected(imgPosts)).isTrue()
        assertThat(on.toggle(imgPosts, r).isSelected(imgPosts)).isFalse()
    }

    @Test
    fun `une case non purgeable est refusee`() {
        val r = report()
        val s = CachePurgeSelection()
            .toggle(id(CacheDataKind.DOCUMENTS, CacheDomain.POSTS), r)
            .toggle(id(CacheDataKind.IMAGES, CacheDomain.REELS), r)
        assertThat(s.ids).isEmpty()
    }

    @Test
    fun `un en-tete de type selectionne ses cases puis les deselectionne`() {
        val r = report()
        val on = CachePurgeSelection().toggleKind(CacheDataKind.IMAGES, r)
        assertThat(on.ids).containsExactly(imgPosts, imgStories)
        assertThat(on.toggleKind(CacheDataKind.IMAGES, r).ids).isEmpty()
    }

    @Test
    fun `un type partiellement coche se complete`() {
        val r = report()
        val s = CachePurgeSelection().toggle(imgPosts, r).toggleKind(CacheDataKind.IMAGES, r)
        assertThat(s.ids).containsExactly(imgPosts, imgStories)
    }

    @Test
    fun `tout selectionner ne prend que du purgeable`() {
        val r = report()
        val s = CachePurgeSelection().toggleEverything(r)
        assertThat(s.ids).containsExactly(imgPosts, imgStories, vidPosts)
        assertThat(s.toggleEverything(r).ids).isEmpty()
    }

    @Test
    fun `un domaine entier se bascule`() {
        val r = report()
        assertThat(CachePurgeSelection().toggleDomain(CacheDomain.POSTS, r).ids).containsExactly(imgPosts, vidPosts)
    }

    @Test
    fun `une case devenue vide apres mesure quitte la selection`() {
        val s = CachePurgeSelection().toggleEverything(report())
        val after = s.afterMeasure(report(imgStoriesBytes = 0L))
        assertThat(after.ids).containsExactly(imgPosts, vidPosts)
    }

    @Test
    fun `le majorant somme les cases selectionnees et le residu inclus`() {
        val r = report(unattributed = 7L)
        val s = CachePurgeSelection().toggle(imgPosts, r).toggle(vidPosts, r)
        assertThat(s.selectedBytes(r)).isEqualTo(500L)
        assertThat(s.withUnattributed(true).selectedBytes(r)).isEqualTo(507L)
    }

    @Test
    fun `le bouton dit rien a vider sans selection puis jusqu a X`() {
        val r = report()
        assertThat(CachePurgeSelection().buttonState(r)).isEqualTo(CachePurgeButtonState.NothingSelected)
        assertThat(CachePurgeSelection().toggle(imgPosts, r).buttonState(r)).isEqualTo(CachePurgeButtonState.UpTo(100L))
    }

    @Test
    fun `le residu seul compte comme selection seulement s il est non nul`() {
        assertThat(CachePurgeSelection().withUnattributed(true).hasSelection(report(unattributed = 0L))).isFalse()
        assertThat(CachePurgeSelection().withUnattributed(true).hasSelection(report(unattributed = 3L))).isTrue()
    }
}

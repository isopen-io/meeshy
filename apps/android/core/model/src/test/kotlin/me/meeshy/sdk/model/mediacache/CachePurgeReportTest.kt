package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CachePurgeReportTest {

    private fun id(k: CacheDataKind, d: CacheDomain) = CachePurgeCellId(k, d)

    private fun report(unattributed: Long = 0L, total: Long = 0L) = CachePurgeReport.of(
        mapOf(
            id(CacheDataKind.IMAGES, CacheDomain.POSTS) to 100L,
            id(CacheDataKind.IMAGES, CacheDomain.STORIES) to 50L,
            id(CacheDataKind.VIDEOS, CacheDomain.POSTS) to 400L,
            id(CacheDataKind.MESSAGES, CacheDomain.CONVERSATIONS) to 30L,
            id(CacheDataKind.DOCUMENTS, CacheDomain.POSTS) to 999L,
        ),
        unattributed,
        total,
    )

    @Test
    fun `la grille est complete`() {
        assertThat(report().cells).hasSize(28)
    }

    @Test
    fun `agregats par type et par domaine`() {
        val r = report()
        assertThat(r.bytesFor(CacheDataKind.IMAGES)).isEqualTo(150L)
        assertThat(r.bytesFor(CacheDomain.POSTS)).isEqualTo(500L)
        assertThat(r.bytesFor(CacheDataKind.DOCUMENTS)).isEqualTo(0L)
    }

    @Test
    fun `invariant cases medias plus residu egale total disque`() {
        assertThat(report(unattributed = 25L, total = 575L).isDiskInvariantHolding).isTrue()
        assertThat(report(unattributed = 25L, total = 600L).isDiskInvariantHolding).isFalse()
        assertThat(report().attributedMediaBytes).isEqualTo(550L)
    }

    @Test
    fun `les messages ne comptent pas dans les medias`() {
        assertThat(report().attributedMediaBytes).isEqualTo(550L)
    }

    @Test
    fun `seules les cases purgeables non vides sont selectionnables`() {
        val ids = report().selectableIds
        assertThat(ids).contains(id(CacheDataKind.IMAGES, CacheDomain.POSTS))
        assertThat(ids).doesNotContain(id(CacheDataKind.IMAGES, CacheDomain.REELS))
        assertThat(ids).doesNotContain(id(CacheDataKind.DOCUMENTS, CacheDomain.POSTS))
    }

    @Test
    fun `les negatifs sont ramenes a zero`() {
        val r = CachePurgeReport.of(emptyMap(), -5L, -9L)
        assertThat(r.unattributedBytes).isEqualTo(0L)
        assertThat(r.totalDiskBytes).isEqualTo(0L)
    }
}

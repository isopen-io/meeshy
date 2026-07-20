package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the pure cache-report model — the single source of truth for
 * per-category byte sizes, the derived total, emptiness, and optimistic clearing.
 */
class MediaCacheReportTest {

    @Test
    fun `of normalises a partial map to a full per-category report`() {
        val report = MediaCacheReport.of(mapOf(MediaCacheCategory.IMAGES to 2048L))

        assertThat(report.bytesFor(MediaCacheCategory.IMAGES)).isEqualTo(2048L)
        assertThat(report.bytesFor(MediaCacheCategory.AUDIO)).isEqualTo(0L)
        assertThat(report.bytesFor(MediaCacheCategory.VIDEO)).isEqualTo(0L)
        assertThat(report.bytesFor(MediaCacheCategory.THUMBNAILS)).isEqualTo(0L)
    }

    @Test
    fun `of clamps negative sizes to zero`() {
        val report = MediaCacheReport.of(mapOf(MediaCacheCategory.AUDIO to -1L))

        assertThat(report.bytesFor(MediaCacheCategory.AUDIO)).isEqualTo(0L)
        assertThat(report.isEmpty).isTrue()
    }

    @Test
    fun `total is the sum of every category`() {
        val report = MediaCacheReport.of(
            mapOf(
                MediaCacheCategory.IMAGES to 100L,
                MediaCacheCategory.AUDIO to 200L,
                MediaCacheCategory.VIDEO to 300L,
                MediaCacheCategory.THUMBNAILS to 400L,
            ),
        )

        assertThat(report.totalBytes).isEqualTo(1000L)
        assertThat(report.isEmpty).isFalse()
    }

    @Test
    fun `an all-zero report is empty`() {
        assertThat(MediaCacheReport.EMPTY.isEmpty).isTrue()
        assertThat(MediaCacheReport.EMPTY.totalBytes).isEqualTo(0L)
    }

    @Test
    fun `a report with a single non-zero category is not empty`() {
        val report = MediaCacheReport.of(mapOf(MediaCacheCategory.THUMBNAILS to 1L))

        assertThat(report.isEmpty).isFalse()
    }

    @Test
    fun `nonEmptyCategories lists only categories with bytes, in declaration order`() {
        val report = MediaCacheReport.of(
            mapOf(
                MediaCacheCategory.VIDEO to 5L,
                MediaCacheCategory.IMAGES to 5L,
            ),
        )

        assertThat(report.nonEmptyCategories)
            .containsExactly(MediaCacheCategory.IMAGES, MediaCacheCategory.VIDEO)
            .inOrder()
    }

    @Test
    fun `nonEmptyCategories is empty for an empty report`() {
        assertThat(MediaCacheReport.EMPTY.nonEmptyCategories).isEmpty()
    }

    @Test
    fun `withCleared zeroes the requested categories and preserves the rest`() {
        val report = MediaCacheReport.of(
            mapOf(
                MediaCacheCategory.IMAGES to 100L,
                MediaCacheCategory.AUDIO to 200L,
            ),
        )

        val cleared = report.withCleared(setOf(MediaCacheCategory.IMAGES))

        assertThat(cleared.bytesFor(MediaCacheCategory.IMAGES)).isEqualTo(0L)
        assertThat(cleared.bytesFor(MediaCacheCategory.AUDIO)).isEqualTo(200L)
    }

    @Test
    fun `withCleared over every category yields an empty report`() {
        val report = MediaCacheReport.of(mapOf(MediaCacheCategory.IMAGES to 100L))

        val cleared = report.withCleared(MediaCacheCategory.entries.toSet())

        assertThat(cleared.isEmpty).isTrue()
    }

    @Test
    fun `withCleared on an empty set is inert`() {
        val report = MediaCacheReport.of(mapOf(MediaCacheCategory.IMAGES to 100L))

        assertThat(report.withCleared(emptySet())).isEqualTo(report)
    }
}

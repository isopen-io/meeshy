package me.meeshy.ui.component.viewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageViewerPrefetchTest {

    @Test
    fun `from the middle it prefetches both sides nearest-first, forward before backward`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 5, total = 20, radius = 2))
            .containsExactly(6, 4, 7, 3)
            .inOrder()
    }

    @Test
    fun `at the first page only forward neighbours exist`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 0, total = 20, radius = 2))
            .containsExactly(1, 2)
            .inOrder()
    }

    @Test
    fun `at the last page only backward neighbours exist`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 19, total = 20, radius = 2))
            .containsExactly(18, 17)
            .inOrder()
    }

    @Test
    fun `near the start the out-of-range backward index is dropped, not rolled past the end`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 1, total = 3, radius = 2))
            .containsExactly(2, 0)
            .inOrder()
    }

    @Test
    fun `an empty gallery has nothing to prefetch`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 0, total = 0, radius = 2)).isEmpty()
    }

    @Test
    fun `a single-image gallery has no neighbours`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 0, total = 1, radius = 2)).isEmpty()
    }

    @Test
    fun `a zero radius disables prefetch`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 5, total = 20, radius = 0)).isEmpty()
    }

    @Test
    fun `a negative radius disables prefetch`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 5, total = 20, radius = -3)).isEmpty()
    }

    @Test
    fun `a radius wider than the gallery clamps to the available neighbours without duplicates or the current page`() {
        val result = ImageViewerPrefetch.neighbors(currentIndex = 1, total = 3, radius = 10)
        assertThat(result).containsExactly(2, 0).inOrder()
        assertThat(result).doesNotContain(1)
        assertThat(result).containsNoDuplicates()
    }

    @Test
    fun `a negative current index is coerced into the gallery bounds`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = -5, total = 4, radius = 2))
            .containsExactly(1, 2)
            .inOrder()
    }

    @Test
    fun `a current index past the end is coerced to the last page`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 99, total = 4, radius = 2))
            .containsExactly(2, 1)
            .inOrder()
    }

    @Test
    fun `the current page is never prefetched and every index stays in bounds`() {
        val total = 7
        (0 until total).forEach { current ->
            val result = ImageViewerPrefetch.neighbors(currentIndex = current, total = total, radius = 3)
            assertThat(result).doesNotContain(current)
            result.forEach { index ->
                assertThat(index).isAtLeast(0)
                assertThat(index).isAtMost(total - 1)
            }
            assertThat(result).containsNoDuplicates()
        }
    }

    @Test
    fun `the default radius prefetches two pages on each side`() {
        assertThat(ImageViewerPrefetch.neighbors(currentIndex = 5, total = 20))
            .isEqualTo(ImageViewerPrefetch.neighbors(currentIndex = 5, total = 20, radius = 2))
    }
}

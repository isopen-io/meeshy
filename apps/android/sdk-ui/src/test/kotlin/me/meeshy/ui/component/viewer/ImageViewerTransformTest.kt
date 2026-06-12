package me.meeshy.ui.component.viewer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ImageViewerTransformTest {

    @Test
    fun `scale is clamped between min and max`() {
        assertThat(ImageViewerTransform.clampScale(0.3f)).isEqualTo(ImageViewerTransform.MIN_SCALE)
        assertThat(ImageViewerTransform.clampScale(2.5f)).isEqualTo(2.5f)
        assertThat(ImageViewerTransform.clampScale(9f)).isEqualTo(ImageViewerTransform.MAX_SCALE)
    }

    @Test
    fun `at rest scale there is no pan range`() {
        assertThat(ImageViewerTransform.maxOffset(containerSize = 1080f, scale = 1f)).isEqualTo(0f)
    }

    @Test
    fun `zoomed in the pan range covers the overflowing half on each side`() {
        assertThat(ImageViewerTransform.maxOffset(containerSize = 1000f, scale = 3f)).isEqualTo(1000f)
    }

    @Test
    fun `the offset is clamped symmetrically to the pan range`() {
        assertThat(ImageViewerTransform.clampOffset(1500f, containerSize = 1000f, scale = 3f))
            .isEqualTo(1000f)
        assertThat(ImageViewerTransform.clampOffset(-1500f, containerSize = 1000f, scale = 3f))
            .isEqualTo(-1000f)
        assertThat(ImageViewerTransform.clampOffset(400f, containerSize = 1000f, scale = 3f))
            .isEqualTo(400f)
    }

    @Test
    fun `double tap toggles between rest and the zoomed preset`() {
        assertThat(ImageViewerTransform.doubleTapTarget(1f))
            .isEqualTo(ImageViewerTransform.DOUBLE_TAP_SCALE)
        assertThat(ImageViewerTransform.doubleTapTarget(ImageViewerTransform.DOUBLE_TAP_SCALE))
            .isEqualTo(ImageViewerTransform.MIN_SCALE)
        assertThat(ImageViewerTransform.doubleTapTarget(3.7f))
            .isEqualTo(ImageViewerTransform.MIN_SCALE)
    }
}

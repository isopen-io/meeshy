package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ForegroundMediaFrameTest {

    @Test
    fun `an unmeasured or square media is half the design width on each side`() {
        assertThat(ForegroundMediaFrame.baseDesignSize(1.0)).isEqualTo(CanvasSize(540.0, 540.0))
        assertThat(ForegroundMediaFrame.baseDesignSize(1.04)).isEqualTo(CanvasSize(540.0, 540.0))
        assertThat(ForegroundMediaFrame.baseDesignSize(null)).isEqualTo(CanvasSize(540.0, 540.0))
    }

    @Test
    fun `a portrait media fills a 702 high envelope and keeps its ratio`() {
        val size = ForegroundMediaFrame.baseDesignSize(0.5)

        assertThat(size.height).isWithin(1e-9).of(702.0)
        assertThat(size.width).isWithin(1e-9).of(351.0)
    }

    @Test
    fun `a landscape media fills a 702 wide envelope and keeps its ratio`() {
        val size = ForegroundMediaFrame.baseDesignSize(2.0)

        assertThat(size.width).isWithin(1e-9).of(702.0)
        assertThat(size.height).isWithin(1e-9).of(351.0)
    }

    @Test
    fun `an extreme ratio is bounded between a tenth and ten`() {
        assertThat(ForegroundMediaFrame.baseDesignSize(0.001).width).isWithin(1e-9).of(70.2)
        assertThat(ForegroundMediaFrame.baseDesignSize(1000.0).height).isWithin(1e-9).of(70.2)
    }

    @Test
    fun `a hostile ratio reads as unmeasured`() {
        assertThat(ForegroundMediaFrame.baseDesignSize(Double.NaN)).isEqualTo(CanvasSize(540.0, 540.0))
        assertThat(ForegroundMediaFrame.baseDesignSize(-2.0)).isEqualTo(CanvasSize(540.0, 540.0))
        assertThat(ForegroundMediaFrame.baseDesignSize(Double.POSITIVE_INFINITY)).isEqualTo(CanvasSize(540.0, 540.0))
    }

    @Test
    fun `the measured ratio needs both strictly positive dimensions`() {
        assertThat(ForegroundMediaFrame.measuredAspectRatio(1080, 1920)).isWithin(1e-9).of(0.5625)
        assertThat(ForegroundMediaFrame.measuredAspectRatio(null, 1920)).isNull()
        assertThat(ForegroundMediaFrame.measuredAspectRatio(1080, 0)).isNull()
    }

    @Test
    fun `the rendered frame projects the design size on the rendered width and the object scale`() {
        val frame = ForegroundMediaFrame.renderedSize(aspectRatio = 2.0, scale = 2.0, canvasWidth = 540.0)

        assertThat(frame.width).isWithin(1e-9).of(702.0)
        assertThat(frame.height).isWithin(1e-9).of(351.0)
    }
}

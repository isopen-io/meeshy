package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTextFrameWireTest {
    @Test
    fun `a positive border width without colour is a white ring`() {
        val frame = StoryTextFrame.fromWire("pill", null, 3.0, null)
        assertThat(frame.borderColor).isEqualTo("FFFFFF")
        assertThat(frame.borderIsVisible).isTrue()
    }

    @Test
    fun `no border width means no colour is invented`() {
        assertThat(StoryTextFrame.fromWire(null, null, null, null).borderColor).isNull()
        assertThat(StoryTextFrame.fromWire(null, null, 0.0, null).borderIsVisible).isFalse()
    }

    @Test
    fun `an unknown shape reads as rounded and bounds are clamped`() {
        val frame = StoryTextFrame.fromWire("hexagon", 9.0, 99.0, "FF0000")
        assertThat(frame.shape).isEqualTo(StoryTextFrameShape.ROUNDED)
        assertThat(frame.paddingScale).isEqualTo(StoryTextFrame.MAX_PADDING)
        assertThat(frame.borderWidth).isEqualTo(StoryTextFrame.MAX_BORDER)
    }

    @Test
    fun `automatic horizontal margin is at least the width of an o times the padding scale`() {
        val m = StoryTextFrameGeometry.metrics(StoryTextFrameShape.PILL, true, 100.0, 40.0, oGlyphWidth = 30.0, paddingScale = 2.0)
        assertThat(m.glyphX).isEqualTo(60.0)
        val small = StoryTextFrameGeometry.metrics(StoryTextFrameShape.PILL, true, 100.0, 40.0, oGlyphWidth = 2.0, paddingScale = 1.0)
        assertThat(small.glyphX).isEqualTo(8.0)
    }
}

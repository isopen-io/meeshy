package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryTextFrameTest {
    private val solid = StoryTextBackground.Solid("000000")

    @Test
    fun `a fresh frame is rounded, unit padding, no border`() {
        val frame = StoryTextFrame()
        assertThat(frame.shape).isEqualTo(StoryTextFrameShape.ROUNDED)
        assertThat(frame.resolvedPaddingScale).isEqualTo(1f)
        assertThat(frame.borderIsVisible).isFalse()
    }

    @Test
    fun `an unknown wire shape reads as rounded like iOS`() {
        assertThat(StoryTextFrameShape.fromWire("hexagon")).isEqualTo(StoryTextFrameShape.ROUNDED)
        assertThat(StoryTextFrameShape.fromWire(null)).isEqualTo(StoryTextFrameShape.ROUNDED)
        assertThat(StoryTextFrameShape.fromWire("speech")).isEqualTo(StoryTextFrameShape.SPEECH)
    }

    @Test
    fun `the box needs a shape and something to see`() {
        assertThat(StoryTextFrame().hasBox(StoryTextBackground.None)).isFalse()
        assertThat(StoryTextFrame().hasBox(solid)).isTrue()
        assertThat(StoryTextFrame(borderWidth = 2f).hasBox(StoryTextBackground.None)).isTrue()
        assertThat(StoryTextFrame(shape = StoryTextFrameShape.NONE, borderWidth = 2f).hasBox(solid)).isFalse()
    }

    @Test
    fun `choosing a shape on a neutral text posts a discreet white border`() {
        val framed = StoryTextFrame().shaped(StoryTextFrameShape.PILL, StoryTextBackground.None)
        assertThat(framed.shape).isEqualTo(StoryTextFrameShape.PILL)
        assertThat(framed.borderWidth).isEqualTo(2f)
        assertThat(framed.borderColor).isEqualTo("FFFFFF")
    }

    @Test
    fun `choosing a shape never touches a text that already shows a background or chose none`() {
        assertThat(StoryTextFrame().shaped(StoryTextFrameShape.CLOUD, solid).borderWidth).isEqualTo(0f)
        assertThat(StoryTextFrame().shaped(StoryTextFrameShape.NONE, StoryTextBackground.None).borderWidth).isEqualTo(0f)
    }

    @Test
    fun `padding is bounded to zero through three`() {
        assertThat(StoryTextFrame().padded(9f).paddingScale).isEqualTo(3f)
        assertThat(StoryTextFrame().padded(-1f).paddingScale).isEqualTo(0f)
        assertThat(StoryTextFrame(paddingScale = Float.NaN).resolvedPaddingScale).isEqualTo(1f)
    }

    @Test
    fun `the border slider bounds the width and keeps or posts the colour`() {
        val raised = StoryTextFrame().bordered(30f)
        assertThat(raised.borderWidth).isEqualTo(12f)
        assertThat(raised.borderColor).isEqualTo("FFFFFF")
        val kept = StoryTextFrame(borderWidth = 4f, borderColor = "FF3B30").bordered(0f)
        assertThat(kept.borderWidth).isEqualTo(0f)
        assertThat(kept.borderColor).isEqualTo("FF3B30")
    }

    @Test
    fun `a colour chosen on a switched off border wakes it at the default width`() {
        val coloured = StoryTextFrame().colored("34C759")
        assertThat(coloured.borderColor).isEqualTo("34C759")
        assertThat(coloured.borderWidth).isEqualTo(2f)
        assertThat(StoryTextFrame(borderWidth = 6f).colored("34C759").borderWidth).isEqualTo(6f)
    }
}

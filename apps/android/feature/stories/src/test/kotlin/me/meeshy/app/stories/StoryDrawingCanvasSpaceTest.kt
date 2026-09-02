package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure screen⇄design-space mapping the drawing capture
 * Canvas relies on. No Android, no Compose — the touch→stroke conversion is
 * verifiable on the JVM alone.
 */
@RunWith(JUnit4::class)
class StoryDrawingCanvasSpaceTest {

    // MARK: toDesignPoint

    @Test
    fun `screen centre maps to design centre`() {
        val point = StoryDrawingCanvasSpace.toDesignPoint(
            offsetXPx = 540f,
            offsetYPx = 960f,
            canvasWidthPx = 1080f,
            canvasHeightPx = 1920f,
        )
        assertThat(point?.x).isEqualTo(540.0)
        assertThat(point?.y).isEqualTo(960.0)
    }

    @Test
    fun `a smaller measured canvas scales points up to the design referential`() {
        val point = StoryDrawingCanvasSpace.toDesignPoint(
            offsetXPx = 270f,
            offsetYPx = 480f,
            canvasWidthPx = 540f,
            canvasHeightPx = 960f,
        )
        assertThat(point?.x).isEqualTo(540.0)
        assertThat(point?.y).isEqualTo(960.0)
    }

    @Test
    fun `pressure defaults to full and rides through verbatim when supplied`() {
        val default = StoryDrawingCanvasSpace.toDesignPoint(0f, 0f, 100f, 100f)
        assertThat(default?.pressure).isEqualTo(1.0)

        val custom = StoryDrawingCanvasSpace.toDesignPoint(0f, 0f, 100f, 100f, pressure = 0.4)
        assertThat(custom?.pressure).isEqualTo(0.4)
    }

    @Test
    fun `an unmeasured canvas (zero or negative size) yields no point rather than dividing by zero`() {
        assertThat(StoryDrawingCanvasSpace.toDesignPoint(10f, 10f, 0f, 1920f)).isNull()
        assertThat(StoryDrawingCanvasSpace.toDesignPoint(10f, 10f, 1080f, 0f)).isNull()
        assertThat(StoryDrawingCanvasSpace.toDesignPoint(10f, 10f, -1f, 1920f)).isNull()
    }

    // MARK: toScreenX / toScreenY / toScreenWidth — the inverse projection

    @Test
    fun `toScreenX and toScreenY invert toDesignPoint`() {
        val x = StoryDrawingCanvasSpace.toScreenX(540.0, 1080f)
        val y = StoryDrawingCanvasSpace.toScreenY(960.0, 1920f)
        assertThat(x).isEqualTo(540f)
        assertThat(y).isEqualTo(960f)
    }

    @Test
    fun `toScreenWidth scales by the canvas width only, matching a canvas half the design size`() {
        assertThat(StoryDrawingCanvasSpace.toScreenWidth(14.0, 540f)).isEqualTo(7f)
    }
}

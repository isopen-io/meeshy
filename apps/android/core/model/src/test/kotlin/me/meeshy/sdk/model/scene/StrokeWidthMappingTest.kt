package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test

private fun stroke(width: Double = 10.0, tool: StrokeTool = StrokeTool.PEN, version: Int = 1) =
    StoryDrawingStroke(id = "s", colorHex = "FFFFFF", width = width, tool = tool, captureVersion = version)

class StrokeWidthMappingTest {
    @Test fun `le marqueur double la largeur de base`() {
        assertThat(StrokeWidthMapping.base(10.0, StrokeTool.MARKER)).isEqualTo(20.0)
        assertThat(StrokeWidthMapping.base(10.0, StrokeTool.PEN)).isEqualTo(10.0)
    }

    @Test fun `captureVersion 0 rend la base constante quelle que soit la pression`() {
        val s = stroke(version = 0)
        assertThat(StrokeWidthMapping.effectiveWidth(s, 0.0)).isEqualTo(10.0)
        assertThat(StrokeWidthMapping.effectiveWidth(s, 1.0)).isEqualTo(10.0)
        assertThat(StrokeWidthMapping.effectiveWidth(stroke(tool = StrokeTool.MARKER, version = 0), 0.2)).isEqualTo(20.0)
    }

    @Test fun `captureVersion 1 va de 40 pour cent a la base et ne depasse jamais la base`() {
        val s = stroke(width = 10.0)
        assertThat(StrokeWidthMapping.effectiveWidth(s, 0.0)).isWithin(1e-9).of(4.0)
        assertThat(StrokeWidthMapping.effectiveWidth(s, 0.5)).isWithin(1e-9).of(7.0)
        assertThat(StrokeWidthMapping.effectiveWidth(s, 1.0)).isWithin(1e-9).of(10.0)
        assertThat(StrokeWidthMapping.effectiveWidth(s, 5.0)).isEqualTo(10.0)
    }

    @Test fun `le plancher est 1 pixel design`() {
        assertThat(StrokeWidthMapping.effectiveWidth(stroke(width = 1.0), 0.0)).isEqualTo(1.0)
        assertThat(StrokeWidthMapping.effectiveWidth(stroke(width = 0.2, version = 0), 0.0)).isEqualTo(1.0)
    }
}

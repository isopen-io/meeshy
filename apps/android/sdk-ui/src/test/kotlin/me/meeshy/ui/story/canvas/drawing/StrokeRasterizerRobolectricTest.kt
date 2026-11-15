package me.meeshy.ui.story.canvas.drawing

import android.graphics.Bitmap
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeTool
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StrokeRasterizerRobolectricTest {

    private fun stroke(tool: StrokeTool = StrokeTool.PEN) = StoryDrawingStroke(
        id = "s",
        points = listOf(StoryDrawingStrokePoint(100.0, 100.0), StoryDrawingStrokePoint(900.0, 1500.0)),
        colorHex = "FF3B30",
        width = 20.0,
        tool = tool,
    )

    @Test
    fun `le bitmap est a l'echelle ecran demandee et garde un canal alpha`() {
        val bitmap = StrokeRasterizer.bitmap(listOf(stroke()), widthPx = 270, heightPx = 480)!!
        assertThat(bitmap.width).isEqualTo(270)
        assertThat(bitmap.height).isEqualTo(480)
        assertThat(bitmap.config).isEqualTo(Bitmap.Config.ARGB_8888)
    }

    @Test
    fun `rien a peindre ou surface vide ne produit aucun bitmap`() {
        assertThat(StrokeRasterizer.bitmap(listOf(stroke(StrokeTool.ERASER)), 270, 480)).isNull()
        assertThat(StrokeRasterizer.bitmap(emptyList(), 270, 480)).isNull()
        assertThat(StrokeRasterizer.bitmap(listOf(stroke()), 0, 480)).isNull()
    }
}

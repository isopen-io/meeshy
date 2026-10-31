package me.meeshy.app.stories

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Density
import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerSelectionFrameTest {
    private val density = Density(density = 3f)

    @Test
    fun `the selection frame is a solid stroke, never a dashed one`() {
        assertThat(sceneSelectionFrameStroke(density, scale = 1f).pathEffect).isNull()
        assertThat(sceneSelectionFrameStroke(density, scale = 2.5f).pathEffect).isNull()
    }

    @Test
    fun `the selection frame is white`() {
        assertThat(SELECTION_FRAME_COLOR).isEqualTo(Color.White)
    }

    @Test
    fun `the stroke keeps two dp on screen whatever the scale of the object`() {
        assertThat(sceneSelectionFrameStroke(density, scale = 1f).width).isWithin(0.001f).of(6f)
        assertThat(sceneSelectionFrameStroke(density, scale = 2f).width).isWithin(0.001f).of(3f)
        assertThat(sceneSelectionFrameStroke(density, scale = 0.5f).width).isWithin(0.001f).of(12f)
    }
}

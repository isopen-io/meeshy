package me.meeshy.ui.story.canvas

import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SceneBitmapRendererRobolectricTest {

    @Test
    fun `le repli plat a les dimensions demandees et la couleur du fond`() {
        val bitmap = SceneBitmapRenderer.flatBackground(270, 480, Color.rgb(30, 27, 75))
        assertThat(bitmap.width).isEqualTo(270)
        assertThat(bitmap.height).isEqualTo(480)
        assertThat(bitmap.getPixel(135, 240)).isEqualTo(Color.rgb(30, 27, 75))
    }

    @Test
    fun `une dimension nulle ne fait jamais echouer le repli`() {
        val bitmap = SceneBitmapRenderer.flatBackground(0, 0, Color.BLACK)
        assertThat(bitmap.width).isEqualTo(1)
        assertThat(bitmap.height).isEqualTo(1)
    }
}

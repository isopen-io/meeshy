package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageFilter
import me.meeshy.sdk.model.scene.SceneLookRecipe
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ColorMatrixFallbackTest {
    private fun solid(color: Int, size: Int = 6): Bitmap =
        Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888).also { it.eraseColor(color) }

    @Test
    fun `une recette neutre rend le bitmap lui-meme sans copie`() {
        val source = solid(Color.rgb(10, 20, 30))
        assertThat(ColorMatrixFallback.render(source, SceneLookRecipe.NEUTRAL)).isSameInstanceAs(source)
    }

    @Test
    fun `le noir et blanc d un filtre de story desature le bitmap`() {
        val source = solid(Color.rgb(200, 80, 40))
        val out = ColorMatrixFallback.render(source, SceneLookRecipe.forStory(StoryFilter.BW, 1f, null))
        val px = out.getPixel(2, 2)
        assertThat(Color.red(px)).isEqualTo(Color.green(px))
        assertThat(Color.green(px)).isEqualTo(Color.blue(px))
        assertThat(out).isNotSameInstanceAs(source)
        assertThat(source.getPixel(2, 2)).isEqualTo(Color.rgb(200, 80, 40))
    }

    @Test
    fun `plus un EV eclaire un gris moyen en lumiere lineaire`() {
        val adj = ImageAdjustments().with(AdjustmentKind.EXPOSURE, 1f)
        val out = ColorMatrixFallback.render(solid(Color.rgb(128, 128, 128)), SceneLookRecipe.forStory(null, 1f, adj))
        assertThat(Color.red(out.getPixel(1, 1))).isIn(com.google.common.collect.Range.closed(174, 176))
    }

    @Test
    fun `les douze filtres de l editeur rendent un bitmap de meme taille`() {
        val source = solid(Color.rgb(120, 90, 200), size = 8)
        ImageFilter.entries.forEach { filter ->
            val out = ColorMatrixFallback.render(source, SceneLookRecipe.forEdit(ImageEditState(filter = filter)))
            assertThat(out.width).isEqualTo(8)
            assertThat(out.height).isEqualTo(8)
        }
    }

    @Test
    fun `le filtre d affichage est nul pour une couleur neutre et present pour un filtre`() {
        assertThat(ColorMatrixFallback.displayFilter(SceneLookRecipe.NEUTRAL)).isNull()
        assertThat(ColorMatrixFallback.displayFilter(SceneLookRecipe.forStory(StoryFilter.VIVID, 1f, null))).isNotNull()
    }
}

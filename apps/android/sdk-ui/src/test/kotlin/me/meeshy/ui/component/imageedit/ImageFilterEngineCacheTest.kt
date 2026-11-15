package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import android.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageFilter
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ImageFilterEngineCacheTest {
    private class Rig {
        var renders = 0
        val engine = ImageFilterEngine(
            colorRenderer = { bitmap, recipe, scale ->
                renders++
                ColorMatrixFallback.render(bitmap, recipe, scale)
            },
        )
    }

    private fun bitmap(w: Int = 8, h: Int = 4): Bitmap =
        Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { it.eraseColor(Color.rgb(100, 120, 140)) }

    @Test
    fun `une valeur revenue ne refait aucun rendu`() {
        val rig = Rig()
        val source = bitmap()
        val a = ImageEditState(filter = ImageFilter.VIVID)
        val b = ImageEditState(filter = ImageFilter.SEPIA)
        val first = rig.engine.render(source, a, "img")
        rig.engine.render(source, b, "img")
        assertThat(rig.renders).isEqualTo(2)
        val back = rig.engine.render(source, a, "img")
        assertThat(rig.renders).isEqualTo(2)
        assertThat(back).isSameInstanceAs(first)
    }

    @Test
    fun `une autre instance d image ne sert jamais le rendu de l ancienne`() {
        val rig = Rig()
        val state = ImageEditState(filter = ImageFilter.VIVID)
        rig.engine.render(bitmap(), state, "img")
        rig.engine.render(bitmap(), state, "img")
        assertThat(rig.renders).isEqualTo(2)
    }

    @Test
    fun `cached rend le bitmap pret et null sinon`() {
        val rig = Rig()
        val source = bitmap()
        val state = ImageEditState(filter = ImageFilter.COOL)
        assertThat(rig.engine.cached(source, state, "img")).isNull()
        val rendered = rig.engine.render(source, state, "img")
        assertThat(rig.engine.cached(source, state, "img")).isSameInstanceAs(rendered)
    }

    @Test
    fun `l orientation puis le recadrage sont cuits avant la couleur`() {
        val rig = Rig()
        val state = ImageEditState(orientationTurns = 1, crop = NormalizedCrop(0f, 0f, 1f, 0.5f))
        val out = rig.engine.render(bitmap(8, 4), state)
        assertThat(out.width).isEqualTo(4)
        assertThat(out.height).isEqualTo(4)
    }

    @Test
    fun `l export en pleine resolution part de l original intact`() {
        val rig = Rig()
        val original = bitmap(64, 32)
        val state = ImageEditState(filter = ImageFilter.NOIR)
        val preview = rig.engine.render(rig.engine.downscaled(original, 16), state, "p", referenceLongSide = 64)
        val export = rig.engine.render(original, state)
        assertThat(preview.width).isEqualTo(16)
        assertThat(export.width).isEqualTo(64)
        assertThat(original.getPixel(0, 0)).isEqualTo(Color.rgb(100, 120, 140))
    }

    @Test
    fun `un etat neutre rend le bitmap tel quel`() {
        val source = bitmap()
        assertThat(Rig().engine.render(source, ImageEditState.IDENTITY)).isSameInstanceAs(source)
    }

    @Test
    fun `les vignettes couvrent les douze filtres`() {
        assertThat(Rig().engine.filterThumbnails(bitmap(40, 20), 10).keys).containsExactlyElementsIn(ImageFilter.entries)
    }

    @Test
    fun `la recette neutre n appelle pas le moteur de couleur`() {
        val rig = Rig()
        rig.engine.render(bitmap(), ImageEditState.IDENTITY)
        rig.engine.render(bitmap(), ImageEditState(orientationTurns = 2))
        assertThat(rig.renders).isEqualTo(0)
    }
}

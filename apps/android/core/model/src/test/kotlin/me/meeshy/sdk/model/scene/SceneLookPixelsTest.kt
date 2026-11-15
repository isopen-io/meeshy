package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter
import org.junit.Test

class SceneLookPixelsTest {
    private fun argb(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    private fun red(p: Int) = (p shr 16) and 0xFF
    private fun green(p: Int) = (p shr 8) and 0xFF
    private fun blue(p: Int) = p and 0xFF
    private fun flat(w: Int, h: Int, px: Int) = IntArray(w * h) { px }
    private fun recipe(params: SceneLookParams = SceneLookParams.NEUTRAL, effect: ImageEffect = ImageEffect.NONE) =
        SceneLookRecipe(params = params, effect = effect)

    @Test
    fun `une recette neutre rend les memes pixels sans toucher l entree`() {
        val src = flat(4, 4, argb(10, 20, 30))
        val out = SceneLookPixels.render(src, 4, 4, SceneLookRecipe.NEUTRAL)
        assertThat(out).isEqualTo(src)
        assertThat(out).isNotSameInstanceAs(src)
    }

    @Test
    fun `plus un EV double la lumiere LINEAIRE d un gris moyen`() {
        val out = SceneLookPixels.render(flat(2, 2, argb(128, 128, 128)), 2, 2, recipe(SceneLookParams(exposure = 1f)))
        assertThat(red(out[0])).isIn(com.google.common.collect.Range.closed(174, 176))
        assertThat(red(out[0])).isEqualTo(green(out[0]))
    }

    @Test
    fun `moins un EV assombrit en lumiere lineaire`() {
        val out = SceneLookPixels.render(flat(2, 2, argb(128, 128, 128)), 2, 2, recipe(SceneLookParams(exposure = -1f)))
        assertThat(red(out[0])).isIn(com.google.common.collect.Range.closed(91, 93))
    }

    @Test
    fun `la temperature chaude rehausse le rouge et abaisse le bleu`() {
        val out = SceneLookPixels.render(flat(2, 2, argb(128, 128, 128)), 2, 2, recipe(SceneLookParams(temperature = 1f)))
        assertThat(red(out[0])).isGreaterThan(128)
        assertThat(blue(out[0])).isLessThan(128)
    }

    @Test
    fun `la saturation zero rend un gris`() {
        val out = SceneLookPixels.render(flat(2, 2, argb(200, 80, 40)), 2, 2, recipe(SceneLookParams(saturation = 0f)))
        assertThat(red(out[0])).isEqualTo(green(out[0]))
        assertThat(green(out[0])).isEqualTo(blue(out[0]))
    }

    @Test
    fun `le grain n assombrit jamais plus que son alpha maximum de 0,1`() {
        val out = SceneLookPixels.render(flat(32, 32, argb(255, 255, 255)), 32, 32, recipe(SceneLookParams(grain = 1f)))
        assertThat(out.minOf { red(it) }).isAtLeast(229)
        assertThat(out.minOf { red(it) }).isLessThan(255)
    }

    @Test
    fun `le grain est deterministe d un rendu a l autre`() {
        val src = flat(16, 16, argb(200, 200, 200))
        val r = recipe(SceneLookParams(grain = 0.7f))
        assertThat(SceneLookPixels.render(src, 16, 16, r)).isEqualTo(SceneLookPixels.render(src, 16, 16, r))
    }

    @Test
    fun `le flou laisse une image uniforme intacte et etale un point lumineux`() {
        val uniform = SceneLookPixels.render(flat(16, 16, argb(90, 90, 90)), 16, 16, recipe(SceneLookParams(blur = 0.5f)))
        assertThat(uniform.all { red(it) == 90 }).isTrue()
        val dot = flat(21, 21, argb(0, 0, 0)).also { it[10 * 21 + 10] = argb(255, 255, 255) }
        val out = SceneLookPixels.render(dot, 21, 21, recipe(SceneLookParams(blur = 0.5f)))
        assertThat(red(out[10 * 21 + 10])).isLessThan(255)
        assertThat(red(out[10 * 21 + 12])).isGreaterThan(0)
    }

    @Test
    fun `la vignette assombrit les coins et garde le centre`() {
        val out = SceneLookPixels.render(flat(21, 21, argb(200, 200, 200)), 21, 21, recipe(SceneLookParams(vignette = 2f)))
        assertThat(red(out[0])).isLessThan(red(out[10 * 21 + 10]))
        assertThat(red(out[10 * 21 + 10])).isEqualTo(200)
    }

    @Test
    fun `le bloom eclaire le cote sombre d une haute lumiere`() {
        val half = IntArray(31 * 31) { i -> if (i % 31 < 15) argb(255, 255, 255) else argb(60, 60, 60) }
        val out = SceneLookPixels.render(half, 31, 31, recipe(SceneLookParams(bloom = 1f)))
        assertThat(red(out[15 * 31 + 18])).isGreaterThan(60)
        assertThat(red(out[15 * 31 + 30])).isAtLeast(60)
    }

    @Test
    fun `la nettete accentue un bord`() {
        val edge = IntArray(20 * 20) { i -> if (i % 20 < 10) argb(80, 80, 80) else argb(170, 170, 170) }
        val out = SceneLookPixels.render(edge, 20, 20, recipe(SceneLookParams(sharpness = 1f)))
        assertThat(red(out[10 * 20 + 11])).isGreaterThan(170)
        assertThat(red(out[10 * 20 + 8])).isLessThan(80)
    }

    @Test
    fun `chaque filtre et chaque effet de l editeur rend sans erreur et change l image`() {
        val src = IntArray(24 * 24) { i -> argb(i % 24 * 10, i / 24 * 10, (i * 7) % 256) }
        ImageFilter.entries.filter { it != ImageFilter.ORIGINAL }.forEach { f ->
            val out = SceneLookPixels.render(src, 24, 24, SceneLookRecipe.forEdit(ImageEditState(filter = f)))
            assertThat(out).isNotEqualTo(src)
        }
        ImageEffect.entries.filter { it != ImageEffect.NONE }.forEach { e ->
            val out = SceneLookPixels.render(src, 24, 24, SceneLookRecipe.forEdit(ImageEditState(effect = e)))
            assertThat(out).isNotEqualTo(src)
        }
    }

    @Test
    fun `l echelle de rayon reduit le flou d un apercu proportionnellement`() {
        val dot = flat(21, 21, argb(0, 0, 0)).also { it[10 * 21 + 10] = argb(255, 255, 255) }
        val full = SceneLookPixels.render(dot, 21, 21, recipe(SceneLookParams(blur = 0.5f)), radiusScale = 1f)
        val small = SceneLookPixels.render(dot, 21, 21, recipe(SceneLookParams(blur = 0.5f)), radiusScale = 0.25f)
        assertThat(red(small[10 * 21 + 10])).isGreaterThan(red(full[10 * 21 + 10]))
    }
}

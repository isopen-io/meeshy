package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.AdjustmentKind
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageEffect
import me.meeshy.sdk.model.imageedit.ImageFilter
import org.junit.Test

class SceneLookMatrixTest {
    private fun apply(m: StoryColorMatrix, r: Float, g: Float, b: Float): Triple<Float, Float, Float> {
        val v = m.values
        fun row(i: Int) = v[i * 5] * r + v[i * 5 + 1] * g + v[i * 5 + 2] * b + v[i * 5 + 4]
        return Triple(row(0), row(1), row(2))
    }

    @Test
    fun `une recette neutre est neutre et compose en identite`() {
        val recipe = SceneLookRecipe.forStory(null, 1f, null)
        assertThat(recipe.isNeutral).isTrue()
        val (r, g, b) = apply(SceneLookMatrix.composed(recipe), 10f, 120f, 240f)
        assertThat(r).isWithin(0.01f).of(10f)
        assertThat(g).isWithin(0.01f).of(120f)
        assertThat(b).isWithin(0.01f).of(240f)
    }

    @Test
    fun `les controles de couleur neutres sont l identite`() {
        val m = SceneLookMatrix.colorControls(0f, 1f, 1f)
        val (r, g, b) = apply(m, 30f, 60f, 90f)
        assertThat(listOf(r, g, b)).containsExactly(30f, 60f, 90f).inOrder()
    }

    @Test
    fun `saturation zero rend un gris de meme luma`() {
        val (r, g, b) = apply(SceneLookMatrix.colorControls(0f, 1f, 0f), 200f, 100f, 50f)
        assertThat(r).isWithin(0.01f).of(g)
        assertThat(g).isWithin(0.01f).of(b)
    }

    @Test
    fun `le contraste pivote autour du gris moyen`() {
        val (r, _, _) = apply(SceneLookMatrix.colorControls(0f, 1.5f, 1f), 127.5f, 127.5f, 127.5f)
        assertThat(r).isWithin(0.01f).of(127.5f)
    }

    @Test
    fun `la composition applique d abord le premier puis le second`() {
        val double = SceneLookMatrix.gain(2f, 2f, 2f)
        val plusTen = StoryColorMatrix(
            listOf(1f, 0f, 0f, 0f, 10f, 0f, 1f, 0f, 0f, 10f, 0f, 0f, 1f, 0f, 10f, 0f, 0f, 0f, 1f, 0f),
        )
        val (r, _, _) = apply(SceneLookMatrix.compose(double, plusTen), 20f, 0f, 0f)
        assertThat(r).isWithin(0.001f).of(50f)
    }

    @Test
    fun `le chaud rehausse le rouge et abaisse le bleu en gardant la luminance`() {
        val g = SceneLookMatrix.temperatureGains(1f)
        assertThat(g.r).isGreaterThan(1f)
        assertThat(g.b).isLessThan(1f)
        assertThat(0.2125f * g.r + 0.7154f * g.g + 0.0721f * g.b).isWithin(0.001f).of(1f)
        val cold = SceneLookMatrix.temperatureGains(-1f)
        assertThat(cold.r).isLessThan(1f)
        assertThat(cold.b).isGreaterThan(1f)
        assertThat(SceneLookMatrix.temperatureGains(0f).isUnit).isTrue()
    }

    @Test
    fun `l exposition est un gain de deux puissance EV`() {
        assertThat(SceneLookMatrix.exposureGain(1f)).isWithin(1e-5f).of(2f)
        assertThat(SceneLookMatrix.exposureGain(-1f)).isWithin(1e-5f).of(0.5f)
    }

    @Test
    fun `la chaine filtre plus reglages est UNE matrice et le filtre passe avant les reglages`() {
        val adj = ImageAdjustments().with(AdjustmentKind.SATURATION, 0f)
        val recipe = SceneLookRecipe.forStory(StoryFilter.WARM, 1f, adj)
        val chained = SceneLookMatrix.composed(recipe)
        val (r, g, b) = apply(chained, 200f, 100f, 50f)
        assertThat(r).isWithin(0.5f).of(g)
        assertThat(g).isWithin(0.5f).of(b)
    }

    @Test
    fun `une video ne recoit ni nettete ni flou ni bloom ni grain`() {
        val adj = ImageAdjustments()
            .with(AdjustmentKind.SHARPNESS, 1f).with(AdjustmentKind.BLUR, 1f)
            .with(AdjustmentKind.BLOOM, 1f).with(AdjustmentKind.GRAIN, 1f)
            .with(AdjustmentKind.VIGNETTE, 1f)
        val p = SceneLookRecipe.forStory(null, 1f, adj, isVideo = true).params
        assertThat(p.sharpness).isEqualTo(0f)
        assertThat(p.blur).isEqualTo(0f)
        assertThat(p.bloom).isEqualTo(0f)
        assertThat(p.grain).isEqualTo(0f)
        assertThat(p.vignette).isEqualTo(1f)
    }

    @Test
    fun `des reglages neutres d une video donnent une recette neutre sans cout par trame`() {
        val adj = ImageAdjustments().with(AdjustmentKind.BLUR, 1f)
        assertThat(SceneLookRecipe.forStory(null, 1f, adj, isVideo = true).isNeutral).isTrue()
    }

    @Test
    fun `les signatures distinguent les valeurs et egalent les recettes egales`() {
        val a = SceneLookRecipe.forStory(StoryFilter.BW, 1f, ImageAdjustments().with(AdjustmentKind.EXPOSURE, 0.5f))
        val b = SceneLookRecipe.forStory(StoryFilter.BW, 1f, ImageAdjustments().with(AdjustmentKind.EXPOSURE, 0.5f))
        val c = SceneLookRecipe.forStory(StoryFilter.BW, 1f, ImageAdjustments().with(AdjustmentKind.EXPOSURE, 0.6f))
        assertThat(a.signature()).isEqualTo(b.signature())
        assertThat(a.signature()).isNotEqualTo(c.signature())
    }

    @Test
    fun `les douze filtres de l editeur existent et seul l original est neutre`() {
        ImageFilter.entries.forEach { filter ->
            val neutral = SceneLookRecipe.forEdit(ImageEditState(filter = filter)).isNeutral
            assertThat(neutral).isEqualTo(filter == ImageFilter.ORIGINAL)
        }
    }

    @Test
    fun `un effet seul rend la recette non neutre`() {
        assertThat(SceneLookRecipe.forEdit(ImageEditState(effect = ImageEffect.GRAIN)).isNeutral).isFalse()
    }

    @Test
    fun `sans reglage la chaine rend exactement la matrice du filtre de story, a toute intensite`() {
        StoryFilter.entries.forEach { filter ->
            listOf(0f, 0.4f, 1f).forEach { intensity ->
                val expected = StoryFilterMatrix.effectiveMatrix(filter, intensity).values
                val chained = SceneLookMatrix.composed(SceneLookRecipe.forStory(filter, intensity, null)).values
                expected.indices.forEach { assertThat(chained[it]).isWithin(0.001f).of(expected[it]) }
            }
        }
    }

    @Test
    fun `le look du fond d une slide lit son filtre de fil et les reglages du media de fond`() {
        val background = me.meeshy.sdk.model.StoryMediaObject(
            id = "bg",
            isBackground = true,
            adjustments = ImageAdjustments().with(AdjustmentKind.CONTRAST, 1.3f),
        )
        val effects = me.meeshy.sdk.model.StoryEffects(filter = "bw", filterIntensity = 0.5, mediaObjects = listOf(background))
        val recipe = SceneLookRecipe.forEffects(effects)
        assertThat(recipe.params.contrast).isEqualTo(1.3f)
        assertThat(recipe.filterMatrix).isEqualTo(StoryFilterMatrix.effectiveMatrix(StoryFilter.BW, 0.5f))
        assertThat(SceneLookRecipe.forEffects(null).isNeutral).isTrue()
        assertThat(SceneLookRecipe.forEffects(me.meeshy.sdk.model.StoryEffects(filter = "inconnu")).isNeutral).isTrue()
    }
}

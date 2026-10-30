package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.effects.CallColorLook.Rgb
import org.junit.Test

class CallColorLookTest {
    private val skin = Rgb(0.85f, 0.62f, 0.5f)
    private val sky = Rgb(0.35f, 0.55f, 0.85f)

    private fun recipe(preset: VideoFilterPreset) = requireNotNull(CallColorLook.recipe(preset))

    @Test
    fun `natural is no look at all`() {
        assertThat(CallColorLook.recipe(VideoFilterPreset.Natural)).isNull()
        VideoFilterPreset.entries.filter { it != VideoFilterPreset.Natural }.forEach {
            assertThat(CallColorLook.recipe(it)).isNotNull()
        }
    }

    @Test
    fun `warm warms and cool cools a neutral grey`() {
        val grey = Rgb(0.5f, 0.5f, 0.5f)
        val warm = CallColorLook.grade(grey, recipe(VideoFilterPreset.Warm))
        val cool = CallColorLook.grade(grey, recipe(VideoFilterPreset.Cool))
        assertThat(warm.r).isGreaterThan(warm.b)
        assertThat(cool.b).isGreaterThan(cool.r)
    }

    @Test
    fun `vivid saturates a dull colour and muted desaturates it`() {
        val vivid = CallColorLook.grade(sky, recipe(VideoFilterPreset.Vivid))
        val muted = CallColorLook.grade(sky, recipe(VideoFilterPreset.Muted))
        assertThat(CallColorLook.saturation(vivid)).isGreaterThan(CallColorLook.saturation(sky))
        assertThat(CallColorLook.saturation(muted)).isLessThan(CallColorLook.saturation(sky))
    }

    @Test
    fun `skin tones are spared by the colour grade`() {
        assertThat(CallColorLook.skinLikelihood(skin)).isGreaterThan(0.5f)
        assertThat(CallColorLook.skinLikelihood(sky)).isEqualTo(0f)
        val cool = recipe(VideoFilterPreset.Cool)
        val skinShift = CallColorLook.grade(skin, cool).b - skin.b
        val unprotected = CallColorLook.grade(skin, cool.copy(skinProtection = 0f)).b - skin.b
        assertThat(skinShift).isLessThan(unprotected)
    }

    @Test
    fun `every graded value stays in range`() {
        VideoFilterPreset.entries.mapNotNull(CallColorLook::recipe).forEach { r ->
            listOf(Rgb(0f, 0f, 0f), Rgb(1f, 1f, 1f), Rgb(2f, -1f, 0.5f), skin, sky).forEach { c ->
                val g = CallColorLook.grade(c, r)
                listOf(g.r, g.g, g.b).forEach { assertThat(it).isIn(com.google.common.collect.Range.closed(0f, 1f)) }
            }
        }
    }

    @Test
    fun `the strip packs blue slices side by side, red fastest, green down the rows`() {
        val n = 5
        assertThat(CallColorLook.stripSize(n)).isEqualTo(25 to 5)
        val identity = CallColorLook.Recipe(skinProtection = 0f)
        val strip = CallColorLook.lutStrip(identity, n)
        assertThat(strip.size).isEqualTo(25 * 5 * 4)
        fun texel(x: Int, y: Int) = (0..3).map { strip[(y * 25 + x) * 4 + it].toInt() and 0xFF }
        assertThat(texel(0, 0)).isEqualTo(listOf(0, 0, 0, 255))
        assertThat(texel(4 + 4 * 5, 4)).isEqualTo(listOf(255, 255, 255, 255))
        val redOnly = texel(4, 0)
        assertThat(redOnly[0]).isEqualTo(255)
        assertThat(redOnly[2]).isEqualTo(0)
        val blueOnly = texel(4 * 5, 0)
        assertThat(blueOnly[2]).isEqualTo(255)
        assertThat(blueOnly[0]).isEqualTo(0)
    }
}

package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SceneTextWrapPolicyTest {
    private fun cap(shape: StoryTextFrameShape, framed: Boolean, k: Double = 1.0, room: Double? = null, o: Double = 20.0) =
        SceneTextWrapPolicy.measureWidthPx(shape, framed, k, room, o, paddingScale = 1.0)

    /** Coupe gloutonne sur une police à chasse fixe de 30 design-pixels, mesurée à l'échelle [k]. */
    private fun lines(text: String, wrapPx: Double, k: Double): List<String> {
        val out = mutableListOf<String>()
        var line = ""
        text.split(' ').forEach { word ->
            val next = if (line.isEmpty()) word else "$line $word"
            if (line.isNotEmpty() && next.length * 30.0 * k > wrapPx) { out += line; line = word } else line = next
        }
        return out + line
    }

    @Test
    fun `a text wraps at 88 percent of the design width`() {
        assertThat(SceneTextWrapPolicy.designWidth(StoryTextFrameShape.ROUNDED, framed = true)).isWithin(1e-9).of(950.4)
        assertThat(SceneTextWrapPolicy.designWidth(StoryTextFrameShape.NONE, framed = false)).isWithin(1e-9).of(950.4)
    }

    @Test
    fun `only a framed diamond wraps at 44 percent`() {
        assertThat(SceneTextWrapPolicy.designWidth(StoryTextFrameShape.DIAMOND, framed = true)).isWithin(1e-9).of(475.2)
        assertThat(SceneTextWrapPolicy.designWidth(StoryTextFrameShape.DIAMOND, framed = false)).isWithin(1e-9).of(950.4)
    }

    @Test
    fun `the wrap width grows with the pinch scale so lines never change`() {
        val text = "la timeline vit et se coupe a la meme place quelle que soit la taille choisie"
        val one = lines(text, cap(StoryTextFrameShape.ROUNDED, true, k = 1.0), 1.0)
        val two = lines(text, cap(StoryTextFrameShape.ROUNDED, true, k = 2.0), 2.0)
        val half = lines(text, cap(StoryTextFrameShape.ROUNDED, true, k = 0.5), 0.5)
        assertThat(two).isEqualTo(one)
        assertThat(half).isEqualTo(one)
    }

    @Test
    fun `a room smaller than the cap wins and leaves the margin of an o`() {
        val bounded = cap(StoryTextFrameShape.ROUNDED, true, room = 500.0, o = 20.0)
        assertThat(bounded).isWithin(1e-9).of(500.0 - 40.0)
    }

    @Test
    fun `an absurd room never goes negative`() {
        assertThat(cap(StoryTextFrameShape.ROUNDED, true, room = 3.0)).isEqualTo(0.0)
    }
}

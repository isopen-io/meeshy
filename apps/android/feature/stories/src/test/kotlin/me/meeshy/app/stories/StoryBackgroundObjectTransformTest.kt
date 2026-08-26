package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class StoryBackgroundObjectTransformTest {

    private fun bgObject(
        x: Double = 0.5,
        y: Double = 0.5,
        scale: Double = 1.0,
        rotation: Double = 0.0,
    ) = StoryMediaObject(id = "bg", isBackground = true, x = x, y = y, scale = scale, rotation = rotation)

    @Test
    fun `a centred unscaled background projects to identity`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject()))
            .isEqualTo(StoryBackgroundObjectTransform.IDENTITY)
    }

    @Test
    fun `a position right of centre projects to a positive x offset fraction`() {
        val t = StoryBackgroundObjectTransform.from(bgObject(x = 0.75))
        assertThat(t.offsetXFraction).isWithin(1e-6f).of(0.25f)
        assertThat(t.offsetYFraction).isEqualTo(0f)
    }

    @Test
    fun `a position left and above centre projects to negative offset fractions`() {
        val t = StoryBackgroundObjectTransform.from(bgObject(x = 0.25, y = 0.3))
        assertThat(t.offsetXFraction).isWithin(1e-6f).of(-0.25f)
        assertThat(t.offsetYFraction).isWithin(1e-6f).of(-0.2f)
    }

    @Test
    fun `scale passes through unchanged`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = 1.5)).scale)
            .isWithin(1e-6f).of(1.5f)
    }

    @Test
    fun `rotation passes through unchanged`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(rotation = 30.0)).rotationDegrees)
            .isWithin(1e-6f).of(30f)
    }

    @Test
    fun `a non-positive scale decays to the neutral 1x`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = 0.0)).scale).isEqualTo(1f)
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = -2.0)).scale).isEqualTo(1f)
    }

    @Test
    fun `a non-finite scale decays to the neutral 1x`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = Double.NaN)).scale).isEqualTo(1f)
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = Double.POSITIVE_INFINITY)).scale)
            .isEqualTo(1f)
    }

    @Test
    fun `a non-finite position decays to a zero offset`() {
        val t = StoryBackgroundObjectTransform.from(bgObject(x = Double.NaN, y = Double.POSITIVE_INFINITY))
        assertThat(t.offsetXFraction).isEqualTo(0f)
        assertThat(t.offsetYFraction).isEqualTo(0f)
    }

    @Test
    fun `a non-finite rotation decays to zero`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(rotation = Double.NaN)).rotationDegrees)
            .isEqualTo(0f)
    }

    @Test
    fun `isIdentity is true only when every component is neutral`() {
        assertThat(StoryBackgroundObjectTransform.IDENTITY.isIdentity).isTrue()
        assertThat(StoryBackgroundObjectTransform(scale = 1f, offsetXFraction = 0.1f, offsetYFraction = 0f, rotationDegrees = 0f).isIdentity)
            .isFalse()
        assertThat(StoryBackgroundObjectTransform(scale = 1.2f, offsetXFraction = 0f, offsetYFraction = 0f, rotationDegrees = 0f).isIdentity)
            .isFalse()
        assertThat(StoryBackgroundObjectTransform(scale = 1f, offsetXFraction = 0f, offsetYFraction = 0.05f, rotationDegrees = 0f).isIdentity)
            .isFalse()
        assertThat(StoryBackgroundObjectTransform(scale = 1f, offsetXFraction = 0f, offsetYFraction = 0f, rotationDegrees = 5f).isIdentity)
            .isFalse()
    }
}

package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Recadrer par le geste sur la scène (#13973, lot A-E4) : la fenêtre suit le doigt, se resserre au pincement, garde sa forme. */
class StoryMediaReframeTest {

    private fun near(actual: Double, expected: Double) = assertThat(actual).isWithin(1e-9).of(expected)

    @Test
    fun `pinching in narrows the window around its centre, keeping its proportions`() {
        val crop = StoryMediaReframe.reframed(null, 0.0, 0.0, zoom = 2.0)!!
        near(crop.width, 0.5)
        near(crop.height, 0.5)
        near(crop.x, 0.25)
        near(crop.y, 0.25)
    }

    @Test
    fun `dragging moves the window against the finger, so the picture follows it`() {
        val start = StoryMediaCrop(0.25, 0.25, 0.5, 0.5)
        val crop = StoryMediaReframe.reframed(start, panX = 0.2, panY = -0.1, zoom = 1.0)!!
        near(crop.x, 0.15)
        near(crop.y, 0.30)
        near(crop.width, 0.5)
    }

    @Test
    fun `the window stays inside the source`() {
        val crop = StoryMediaReframe.reframed(StoryMediaCrop(0.25, 0.25, 0.5, 0.5), panX = -5.0, panY = 5.0, zoom = 1.0)!!
        near(crop.x, 0.5)
        near(crop.y, 0.0)
    }

    @Test
    fun `pinching out never grows past the source, and keeps the shape of the frame`() {
        val crop = StoryMediaReframe.reframed(StoryMediaCrop(0.1, 0.3, 0.8, 0.4), 0.0, 0.0, zoom = 0.5)!!
        near(crop.width, 1.0)
        near(crop.height, 0.5)
        assertThat(StoryMediaReframe.reframed(StoryMediaCrop(0.25, 0.25, 0.5, 0.5), 0.0, 0.0, zoom = 0.1)).isNull()
    }

    @Test
    fun `the floor holds and an unreadable gesture changes nothing`() {
        val tight = StoryMediaReframe.reframed(null, 0.0, 0.0, zoom = 1_000.0)!!
        near(tight.width, StoryMediaCrop.MINIMUM_SIDE)
        val still = StoryMediaCrop(0.25, 0.25, 0.5, 0.5)
        assertThat(StoryMediaReframe.reframed(still, Double.NaN, Double.NaN, Double.NaN)).isEqualTo(still)
    }

    @Test
    fun `Rotate turns a quarter counter-clockwise, as iOS`() {
        assertThat(StoryMediaRotation.turned(0f)).isEqualTo(270f)
        assertThat(StoryMediaRotation.turned(270f)).isEqualTo(180f)
        assertThat(StoryMediaRotation.turned(90f)).isEqualTo(0f)
        assertThat(StoryMediaRotation.turned(Float.NaN)).isEqualTo(270f)
    }
}

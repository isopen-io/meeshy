package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.StoryAnchorPoint
import me.meeshy.sdk.model.StoryLocationObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryLocationTapFrameTest {

    private fun location(x: Double = 0.5, y: Double = 0.5, scale: Double = 1.0, anchor: StoryAnchorPoint = StoryAnchorPoint()) =
        StoryLocationObject(id = "l", place = SharedPlace(1.0, 2.0, name = "Paris"), x = x, y = y, scale = scale, anchor = anchor)

    @Test
    fun `le cadre est cale sur le badge autour de son centre`() {
        val frame = StoryLocationTapFrame.of(location(), canvasWidth = 1080.0, canvasHeight = 1920.0, textWidth = 200.0, textHeight = 50.0, minimumSide = 0.0)
        assertThat(frame.width).isEqualTo(Math.ceil(44.0 + 42.0 + 10.0 + 200.0))
        assertThat(frame.height).isEqualTo(Math.ceil(28.0 + 50.0))
        assertThat(frame.centerX).isWithin(1e-9).of(540.0)
        assertThat(frame.centerY).isWithin(1e-9).of(960.0)
    }

    @Test
    fun `l ancre decale le cadre`() {
        val frame = StoryLocationTapFrame.of(location(anchor = StoryAnchorPoint(0.0, 0.0)), 1080.0, 1920.0, 200.0, 50.0, 0.0)
        assertThat(frame.left).isWithin(1e-9).of(540.0)
        assertThat(frame.top).isWithin(1e-9).of(960.0)
    }

    @Test
    fun `une petite pastille garde une cible d au moins la taille minimale, centree sur le badge`() {
        val frame = StoryLocationTapFrame.of(location(scale = 0.2), 360.0, 640.0, 10.0, 8.0, minimumSide = 144.0)
        assertThat(frame.width).isEqualTo(144.0)
        assertThat(frame.height).isEqualTo(144.0)
        assertThat(frame.centerX).isWithin(1e-9).of(180.0)
        assertThat(frame.centerY).isWithin(1e-9).of(320.0)
    }

    @Test
    fun `une grande pastille ne retrecit jamais`() {
        val frame = StoryLocationTapFrame.of(location(), 1080.0, 1920.0, 400.0, 50.0, minimumSide = 48.0)
        assertThat(frame.width).isGreaterThan(400.0)
        assertThat(frame.height).isEqualTo(Math.ceil(28.0 + 50.0))
    }

    @Test
    fun `la taille d un gabarit deja mesure sert de cadre`() {
        val frame = StoryLocationTapFrame.ofSize(location(), 1080.0, 1920.0, badgeWidth = 300.0, badgeHeight = 120.0, minimumSide = 48.0)
        assertThat(frame.width).isEqualTo(300.0)
        assertThat(frame.height).isEqualTo(120.0)
        assertThat(frame.centerX).isWithin(1e-9).of(540.0)
    }
}

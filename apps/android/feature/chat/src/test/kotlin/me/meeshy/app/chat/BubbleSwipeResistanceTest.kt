package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleGestureReason
import org.junit.Test

class BubbleSwipeResistanceTest {

    @Test
    fun `a plain bubble swipes at the normal level`() {
        assertThat(BubbleSwipeResistance.of(hasAudio = false, videoCount = 0)).isEqualTo(SwipeResistance.Normal)
    }

    @Test
    fun `an audio or a video bubble swipes at the raised level`() {
        assertThat(BubbleSwipeResistance.of(hasAudio = true, videoCount = 0)).isEqualTo(SwipeResistance.Resistant)
        assertThat(BubbleSwipeResistance.of(hasAudio = false, videoCount = 2)).isEqualTo(SwipeResistance.Resistant)
    }

    @Test
    fun `the raised level asks for 48 dp and a 4 to 1 dominance, the normal one 22 dp and 3 to 1`() {
        assertThat(SwipeResistance.Normal.minimumDistance).isEqualTo(22f)
        assertThat(SwipeResistance.Normal.dominanceRatio).isEqualTo(3f)
        assertThat(SwipeResistance.Resistant.minimumDistance).isEqualTo(48f)
        assertThat(SwipeResistance.Resistant.dominanceRatio).isEqualTo(4f)
    }

    @Test
    fun `a 30 dp drag engages a normal bubble but not a resistant one`() {
        assertThat(BubbleSwipeResistance.shouldEngage(30f, 0f, SwipeResistance.Normal, claimed = false)).isTrue()
        assertThat(BubbleSwipeResistance.shouldEngage(30f, 0f, SwipeResistance.Resistant, claimed = false)).isFalse()
    }

    @Test
    fun `a drag that is 3 to 1 horizontal engages normal but needs 4 to 1 when resistant`() {
        assertThat(BubbleSwipeResistance.shouldEngage(70f, 20f, SwipeResistance.Normal, claimed = false)).isTrue()
        assertThat(BubbleSwipeResistance.shouldEngage(70f, 20f, SwipeResistance.Resistant, claimed = false)).isFalse()
        assertThat(BubbleSwipeResistance.shouldEngage(90f, 20f, SwipeResistance.Resistant, claimed = false)).isTrue()
    }

    @Test
    fun `any live reason disengages the swipe, however clear the drag`() {
        BubbleGestureReason.entries.forEach { reason ->
            val claimed = BubbleSwipeResistance.isGestureOwnershipClaimed(listOf(reason))
            assertThat(claimed).isTrue()
            assertThat(BubbleSwipeResistance.shouldEngage(200f, 0f, SwipeResistance.Normal, claimed)).isFalse()
        }
    }

    @Test
    fun `several reasons at once still disengage and none re-arms`() {
        val both = listOf(BubbleGestureReason.MediaScrubbing, BubbleGestureReason.CarouselOpen)
        assertThat(BubbleSwipeResistance.isGestureOwnershipClaimed(both)).isTrue()
        assertThat(BubbleSwipeResistance.isGestureOwnershipClaimed(emptyList())).isFalse()
    }
}

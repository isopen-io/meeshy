package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleGestureArbiterTest {

    @Test
    fun `a fresh arbiter lets the bubble swipe`() {
        val arbiter = BubbleGestureArbiter()

        assertThat(arbiter.suppressSwipe).isFalse()
        assertThat(arbiter.activeReasonCount).isEqualTo(0)
    }

    @Test
    fun `one active reason suppresses the swipe`() {
        val arbiter = BubbleGestureArbiter()

        arbiter.acquire(BubbleGestureReason.MediaScrubbing)

        assertThat(arbiter.suppressSwipe).isTrue()
        assertThat(arbiter.activeReasonCount).isEqualTo(1)
    }

    @Test
    fun `two active reasons only re-arm the swipe once both are released`() {
        val arbiter = BubbleGestureArbiter()
        val scrubbing = arbiter.acquire(BubbleGestureReason.MediaScrubbing)
        val carousel = arbiter.acquire(BubbleGestureReason.CarouselOpen)

        scrubbing.release()

        assertThat(arbiter.suppressSwipe).isTrue()
        assertThat(arbiter.activeReasonCount).isEqualTo(1)

        carousel.release()

        assertThat(arbiter.suppressSwipe).isFalse()
        assertThat(arbiter.activeReasonCount).isEqualTo(0)
    }

    @Test
    fun `the same reason raised twice counts twice`() {
        val arbiter = BubbleGestureArbiter()
        val first = arbiter.acquire(BubbleGestureReason.Selection)
        arbiter.acquire(BubbleGestureReason.Selection)

        first.release()

        assertThat(arbiter.suppressSwipe).isTrue()
    }

    @Test
    fun `a claim released twice never drives the count negative`() {
        val arbiter = BubbleGestureArbiter()
        val claim = arbiter.acquire(BubbleGestureReason.MediaScrubbing)

        claim.release()
        claim.release()

        assertThat(arbiter.activeReasonCount).isEqualTo(0)
        assertThat(arbiter.suppressSwipe).isFalse()
    }

    @Test
    fun `a double release does not cancel another live reason`() {
        val arbiter = BubbleGestureArbiter()
        val scrubbing = arbiter.acquire(BubbleGestureReason.MediaScrubbing)
        arbiter.acquire(BubbleGestureReason.CarouselOpen)

        scrubbing.release()
        scrubbing.release()

        assertThat(arbiter.suppressSwipe).isTrue()
        assertThat(arbiter.activeReasonCount).isEqualTo(1)
    }

    @Test
    fun `a claim reports whether it is still holding the swipe`() {
        val arbiter = BubbleGestureArbiter()
        val claim = arbiter.acquire(BubbleGestureReason.CarouselOpen)

        assertThat(claim.isActive).isTrue()

        claim.release()

        assertThat(claim.isActive).isFalse()
    }
}

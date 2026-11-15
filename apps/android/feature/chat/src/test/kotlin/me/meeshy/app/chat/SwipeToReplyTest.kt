package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SwipeToReplyTest {

    private val both = SwipeRowSides(canReply = true, canForward = true)

    @Test
    fun `the thresholds stay 72 then 15 percent then 66`() {
        assertThat(SwipeRowLaw.ACTION_ZONE).isEqualTo(72f)
        assertThat(SwipeRowLaw.RUBBER_BAND_FACTOR).isEqualTo(0.15f)
        assertThat(SwipeRowLaw.COMMIT_DISTANCE).isEqualTo(66f)
    }

    @Test
    fun `the row follows the finger inside 72 then brakes at 15 percent`() {
        assertThat(SwipeRowLaw.trackedOffset(72f)).isEqualTo(72f)
        assertThat(SwipeRowLaw.trackedOffset(172f)).isWithin(0.001f).of(72f + 100f * 0.15f)
    }

    @Test
    fun `the haptic fires once on the crossing of 66`() {
        val first = SwipeRowLaw.onDrag(SwipeRowState(), 70f, ReplyDirection.FromIncoming, both)
        assertThat(first.armedHaptic).isTrue()
        val second = SwipeRowLaw.onDrag(first.state, 80f, ReplyDirection.FromIncoming, both)
        assertThat(second.armedHaptic).isFalse()
    }

    @Test
    fun `a received bubble forwards to the left, a sent one forwards to the right`() {
        assertThat(SwipeRowLaw.committed(-70f, replyDirection(isOutgoing = false), both)).isEqualTo(SwipeRowAction.Forward)
        assertThat(SwipeRowLaw.committed(70f, replyDirection(isOutgoing = true), both)).isEqualTo(SwipeRowAction.Forward)
    }

    @Test
    fun `the stamp reaches the free edge opposite to the drag`() {
        assertThat(SwipeRowLaw.indicatorEdge(40f)).isEqualTo(SwipeIndicatorEdge.Start)
        assertThat(SwipeRowLaw.indicatorEdge(-40f)).isEqualTo(SwipeIndicatorEdge.End)
    }
}

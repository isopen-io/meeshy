package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.montage.CallModeGesture
import me.meeshy.sdk.model.call.montage.CallModeGestureOutcome
import me.meeshy.sdk.model.call.montage.CallModeGestureRule
import org.junit.Test

class CallModeRulesTest {
    private val items = listOf("a", "b", "c", "d")

    @Test
    fun `the chosen item is full size and neighbours are smaller and paler`() {
        assertThat(CallModeCarouselRule.scale(true)).isEqualTo(1f)
        assertThat(CallModeCarouselRule.scale(false)).isEqualTo(0.78f)
        assertThat(CallModeCarouselRule.opacity(true)).isEqualTo(1f)
        assertThat(CallModeCarouselRule.opacity(false)).isEqualTo(0.6f)
    }

    @Test
    fun `the side inset centres the first item and never goes negative`() {
        assertThat(CallModeCarouselRule.sideInset(300f, 60f)).isEqualTo(120f)
        assertThat(CallModeCarouselRule.sideInset(40f, 60f)).isEqualTo(0f)
    }

    @Test
    fun `the drag track never goes under 88 dp`() {
        assertThat(CallModeCarouselRule.trackHeight(60f)).isEqualTo(88f)
        assertThat(CallModeCarouselRule.trackHeight(120f)).isEqualTo(120f)
        assertThat(CallModeCarouselRule.verticalMargin(60f)).isEqualTo(14f)
    }

    @Test
    fun `stepping is bounded and an unknown selection falls back on the first item`() {
        assertThat(CallModeCarouselRule.stepping("b", items, 1)).isEqualTo("c")
        assertThat(CallModeCarouselRule.stepping("d", items, 1)).isEqualTo("d")
        assertThat(CallModeCarouselRule.stepping("a", items, -1)).isEqualTo("a")
        assertThat(CallModeCarouselRule.stepping("zzz", items, 1)).isEqualTo("a")
    }

    @Test
    fun `nearestIndex is deduced from the offset and clamped`() {
        assertThat(CallModeCarouselRule.nearestIndex(0f, 60f, 14f, 4)).isEqualTo(0)
        assertThat(CallModeCarouselRule.nearestIndex(150f, 60f, 14f, 4)).isEqualTo(2)
        assertThat(CallModeCarouselRule.nearestIndex(9_999f, 60f, 14f, 4)).isEqualTo(3)
        assertThat(CallModeCarouselRule.nearestIndex(-50f, 60f, 14f, 4)).isEqualTo(0)
        assertThat(CallModeCarouselRule.nearestIndex(10f, 60f, 14f, 0)).isNull()
        assertThat(CallModeCarouselRule.nearestIndex(Float.NaN, 60f, 14f, 4)).isNull()
    }

    @Test
    fun `a programmed trip is settled only once the target is centred`() {
        assertThat(CallModeCarouselRule.settled("b", "d")).isFalse()
        assertThat(CallModeCarouselRule.settled("d", "d")).isTrue()
        assertThat(CallModeCarouselRule.settled("b", null)).isTrue()
    }

    @Test
    fun `nothing commits or follows under the finger`() {
        assertThat(CallModeCarouselRule.commits(true)).isFalse()
        assertThat(CallModeCarouselRule.commits(false)).isTrue()
        assertThat(CallModeCarouselRule.mayFollowSelection(true)).isFalse()
    }

    @Test
    fun `a tap on a far item travels there without choosing anyone on the way`() {
        val (travelling, scrolls) = CallModeCarouselMotion<String>().follows("d", nearest = "a")
        assertThat(scrolls).isTrue()
        assertThat(travelling.settling).isEqualTo("d")

        val onTheWay = travelling.moved("b", infersInteraction = true)
        assertThat(onTheWay.settling).isEqualTo("d")
        assertThat(onTheWay.isInteracting).isFalse()
        assertThat(travelling.rests("b", selection = "a").second).isNull()

        val arrived = onTheWay.moved("d", infersInteraction = true)
        assertThat(arrived.settling).isNull()
    }

    @Test
    fun `resting on another item after a finger drag chooses it`() {
        val dragging = CallModeCarouselMotion<String>().userScrolling(true)
        assertThat(dragging.follows("a", nearest = "c").second).isFalse()
        val released = dragging.userScrolling(false)
        assertThat(released.rests("c", selection = "a").second).isEqualTo("c")
        assertThat(released.rests("a", selection = "a").second).isNull()
        assertThat(released.rests(null, selection = "a").second).isNull()
    }

    @Test
    fun `resting while the finger is still down chooses nobody`() {
        val dragging = CallModeCarouselMotion<String>().userScrolling(true)
        assertThat(dragging.rests("c", selection = "a").second).isNull()
    }

    @Test
    fun `a finger taking over cancels the programmed trip and a tap clears everything`() {
        val (travelling, _) = CallModeCarouselMotion<String>().follows("d", nearest = "a")
        assertThat(travelling.userScrolling(true).settling).isNull()
        assertThat(travelling.userScrolling(true).isInteracting).isTrue()
        assertThat(travelling.userScrolling(true).tapped()).isEqualTo(CallModeCarouselMotion<String>())
    }

    @Test
    fun `selecting the centred item needs no trip`() {
        assertThat(CallModeCarouselMotion<String>().follows("a", nearest = "a").second).isFalse()
    }

    @Test
    fun `the gesture rule picks others by tap, shoots the chosen one and is silent while filming`() {
        assertThat(CallModeGestureRule.outcome(CallModeGesture.TAP, isSelected = false, isRecording = false)).isEqualTo(CallModeGestureOutcome.SELECT)
        assertThat(CallModeGestureRule.outcome(CallModeGesture.DOUBLE_TAP, isSelected = true, isRecording = false)).isEqualTo(CallModeGestureOutcome.CAPTURE_PHOTO)
        assertThat(CallModeGestureRule.outcome(CallModeGesture.LONG_PRESS, isSelected = true, isRecording = false)).isEqualTo(CallModeGestureOutcome.START_RECORDING)
        assertThat(CallModeGestureRule.outcome(CallModeGesture.DOUBLE_TAP, isSelected = true, isRecording = true)).isEqualTo(CallModeGestureOutcome.NONE)
        assertThat(CallModeGestureRule.LONG_PRESS_MILLIS).isEqualTo(450L)
        assertThat(CallModeGestureRule.showsHint(hasSeenHint = false, isRecording = false)).isTrue()
        assertThat(CallModeGestureRule.showsHint(hasSeenHint = true, isRecording = false)).isFalse()
        assertThat(CallModeGestureRule.clock(75_000)).isEqualTo("1:15")
    }
}

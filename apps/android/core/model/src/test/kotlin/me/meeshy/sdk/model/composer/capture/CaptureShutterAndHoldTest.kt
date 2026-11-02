package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureShutterAndHoldTest {
    @Test
    fun `a press under 0,8 s is a photo and beyond closes a take`() {
        assertThat(ShutterGesture.outcome(799, false)).isEqualTo(ShutterGesture.Outcome.PHOTO)
        assertThat(ShutterGesture.outcome(800, false)).isEqualTo(ShutterGesture.Outcome.CLOSE_TAKE)
        assertThat(ShutterGesture.outcome(100, true)).isEqualTo(ShutterGesture.Outcome.KEEP_FILMING)
    }

    @Test
    fun `lock needs 64 dp to the physical right`() {
        assertThat(ShutterGesture.locks(63.9f)).isFalse()
        assertThat(ShutterGesture.locks(64f)).isTrue()
        assertThat(ShutterGesture.locks(-200f)).isFalse()
        assertThat(ShutterGesture.lockProgress(32f)).isEqualTo(0.5f)
        assertThat(ShutterGesture.lockProgress(-5f)).isEqualTo(0f)
        assertThat(ShutterGesture.lockProgress(500f)).isEqualTo(1f)
        assertThat(ShutterGesture.mode(true)).isEqualTo(ShutterGesture.Mode.HANDS_FREE)
        assertThat(ShutterGesture.mode(false)).isEqualTo(ShutterGesture.Mode.VIDEO)
    }

    @Test
    fun `a lock never undoes itself`() {
        assertThat(CaptureHold.phase(70f, false)).isEqualTo(CaptureHold.Phase.LOCKED)
        assertThat(CaptureHold.phase(-100f, true)).isEqualTo(CaptureHold.Phase.LOCKED)
        assertThat(CaptureHold.phase(10f, false)).isEqualTo(CaptureHold.Phase.HOLDING)
    }

    @Test
    fun `release follows the phase`() {
        assertThat(CaptureHold.release(false, CaptureHold.Phase.LOCKED)).isEqualTo(CaptureHold.Release.KEEP_FILMING)
        assertThat(CaptureHold.release(true, CaptureHold.Phase.HOLDING)).isEqualTo(CaptureHold.Release.CLOSE_TAKE)
        assertThat(CaptureHold.release(false, CaptureHold.Phase.HOLDING)).isEqualTo(CaptureHold.Release.CANCEL_PENDING)
    }

    @Test
    fun `the padlock shows as soon as the finger holds`() {
        assertThat(CaptureHold.showsLock(CaptureStage.ARMED, holding = true, locked = false)).isTrue()
        assertThat(CaptureHold.showsLock(CaptureStage.RECORDING, holding = false, locked = false)).isTrue()
        assertThat(CaptureHold.showsLock(CaptureStage.RECORDING, holding = true, locked = true)).isFalse()
        assertThat(CaptureHold.showsLock(CaptureStage.OFF, holding = true, locked = false)).isFalse()
        assertThat(CaptureHold.showsLock(CaptureStage.ARMED, holding = false, locked = false)).isFalse()
    }

    @Test
    fun `vertical drag zooms while recording and dismisses otherwise`() {
        assertThat(CaptureHold.verticalDrag(CaptureStage.RECORDING)).isEqualTo(CaptureHold.VerticalDrag.ZOOM)
        assertThat(CaptureHold.verticalDrag(CaptureStage.ARMED)).isEqualTo(CaptureHold.VerticalDrag.DISMISS)
    }

    @Test
    fun `zoom doubles every 160 dp upward and clamps`() {
        val r = 1f..10f
        assertThat(CaptureZoom.factor(1f, -160f, r)).isWithin(1e-4f).of(2f)
        assertThat(CaptureZoom.factor(2f, 160f, r)).isWithin(1e-4f).of(1f)
        assertThat(CaptureZoom.factor(1f, -9999f, r)).isEqualTo(10f)
        assertThat(CaptureZoom.factor(1f, 9999f, r)).isEqualTo(1f)
        assertThat(CaptureZoom.pinched(2f, 1.5f, r)).isEqualTo(3f)
        assertThat(CaptureZoom.stepped(1f, true, r)).isEqualTo(1.25f)
        assertThat(CaptureZoom.stepped(1f, false, r)).isEqualTo(1f)
        assertThat(CaptureZoom.showsBadge(1.005f)).isFalse()
        assertThat(CaptureZoom.showsBadge(1.5f)).isTrue()
    }

    @Test
    fun `a pinch spoils gestures until its grace elapses`() {
        assertThat(CaptureZoom.pinchSpoilsGestures(true, null, 0)).isTrue()
        assertThat(CaptureZoom.pinchSpoilsGestures(false, 1000, 1399)).isTrue()
        assertThat(CaptureZoom.pinchSpoilsGestures(false, 1000, 1400)).isFalse()
        assertThat(CaptureZoom.pinchSpoilsGestures(false, null, 1400)).isFalse()
    }

    @Test
    fun `displayed zoom is relative to the ultra wide switch over`() {
        val base = CaptureZoomScale.base(listOf(2f, 6f), hasUltraWide = true)
        assertThat(base).isEqualTo(2f)
        assertThat(CaptureZoomScale.base(listOf(2f), hasUltraWide = false)).isEqualTo(1f)
        assertThat(CaptureZoomScale.base(emptyList(), hasUltraWide = true)).isEqualTo(1f)
        val s = CaptureZoomScale(base)
        assertThat(s.displayed(2f)).isEqualTo(1f)
        assertThat(s.device(0.5f)).isEqualTo(1f)
        assertThat(s.opening).isEqualTo(2f)
        val range = s.displayedRange(1f, 40f)
        assertThat(range.start).isEqualTo(0.5f)
        assertThat(range.endInclusive).isEqualTo(10f)
        assertThat(CaptureZoomScale.presets(range)).containsExactly(0.5f, 1f, 2f).inOrder()
        assertThat(CaptureZoomScale.presets(1f..1f)).isEmpty()
        assertThat(CaptureZoomScale.presets(1f..4f)).containsExactly(1f, 2f).inOrder()
    }
}

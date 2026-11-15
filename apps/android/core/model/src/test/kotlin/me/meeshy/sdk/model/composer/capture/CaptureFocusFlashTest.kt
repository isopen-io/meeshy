package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureFocusFlashTest {
    private val full = CaptureFocus.Capabilities(true, true, true, true, true, true)

    @Test
    fun `a tap fixes focus and exposure on the point then watches the scene`() {
        val plan = CaptureFocus.focusing(CapturePoint(0.3f, 0.7f), full)
        assertThat(plan.focus).isEqualTo(CaptureFocus.Mode.Once(CapturePoint(0.3f, 0.7f)))
        assertThat(plan.exposure).isEqualTo(CaptureFocus.Mode.Once(CapturePoint(0.3f, 0.7f)))
        assertThat(plan.watchesSubjectArea).isTrue()
        assertThat(CaptureFocus.aims(plan)).isTrue()
    }

    @Test
    fun `the point is clamped to the sensor`() {
        val plan = CaptureFocus.focusing(CapturePoint(-1f, 2f), full)
        assertThat(plan.focus).isEqualTo(CaptureFocus.Mode.Once(CapturePoint(0f, 1f)))
    }

    @Test
    fun `a lens that cannot aim keeps its continuous setting and shows no ring`() {
        val lens = CaptureFocus.Capabilities(continuousAutoFocus = true, continuousAutoExposure = true)
        val plan = CaptureFocus.focusing(CapturePoint(0.5f, 0.5f), lens)
        assertThat(plan.focus).isEqualTo(CaptureFocus.Mode.Continuous)
        assertThat(plan.watchesSubjectArea).isFalse()
        assertThat(CaptureFocus.aims(plan)).isFalse()
        assertThat(CaptureFocus.focusing(CapturePoint(0.5f, 0.5f), CaptureFocus.NONE).focus).isNull()
    }

    @Test
    fun `exposure alone is enough to aim`() {
        val lens = CaptureFocus.Capabilities(exposurePointOfInterest = true, autoExpose = true)
        assertThat(CaptureFocus.aims(CaptureFocus.focusing(CapturePoint(0.2f, 0.2f), lens))).isTrue()
    }

    @Test
    fun `continuous plan returns to the centre and keeps smoothing during a take`() {
        val plan = CaptureFocus.continuous(full, smooth = true)
        assertThat(plan.focus).isEqualTo(CaptureFocus.Mode.Continuous)
        assertThat(plan.smoothFocus).isTrue()
        assertThat(plan.watchesSubjectArea).isFalse()
        assertThat(CaptureFocus.continuous(CaptureFocus.NONE).focus).isNull()
        assertThat(CaptureFocus.focusesOnTap(CaptureStage.OFF)).isFalse()
        assertThat(CaptureFocus.focusesOnTap(CaptureStage.RECORDING)).isTrue()
    }

    @Test
    fun `flash cycles off on auto`() {
        assertThat(CaptureFlash.next(CaptureFlashMode.OFF)).isEqualTo(CaptureFlashMode.ON)
        assertThat(CaptureFlash.next(CaptureFlashMode.ON)).isEqualTo(CaptureFlashMode.AUTO)
        assertThat(CaptureFlash.next(CaptureFlashMode.AUTO)).isEqualTo(CaptureFlashMode.OFF)
    }

    @Test
    fun `the screen lights the floor only in selfie with an active flash and an open viewfinder`() {
        val on = CaptureFlashMode.AUTO
        assertThat(CaptureFlash.lightsFloor(on, CaptureLensFacing.FRONT, CaptureStage.ARMED)).isTrue()
        assertThat(CaptureFlash.lightsFloor(on, CaptureLensFacing.BACK, CaptureStage.ARMED)).isFalse()
        assertThat(CaptureFlash.lightsFloor(CaptureFlashMode.OFF, CaptureLensFacing.FRONT, CaptureStage.ARMED)).isFalse()
        assertThat(CaptureFlash.lightsFloor(on, CaptureLensFacing.FRONT, CaptureStage.OFF)).isFalse()
    }

    @Test
    fun `the torch exists only on the back lens`() {
        assertThat(CaptureFlash.torch(CaptureFlashMode.ON, CaptureLensFacing.BACK)).isEqualTo(CaptureTorchMode.ON)
        assertThat(CaptureFlash.torch(CaptureFlashMode.AUTO, CaptureLensFacing.BACK)).isEqualTo(CaptureTorchMode.AUTO)
        assertThat(CaptureFlash.torch(CaptureFlashMode.OFF, CaptureLensFacing.BACK)).isEqualTo(CaptureTorchMode.OFF)
        assertThat(CaptureFlash.torch(CaptureFlashMode.ON, CaptureLensFacing.FRONT)).isEqualTo(CaptureTorchMode.OFF)
    }

    @Test
    fun `intensity is bounded and the slider is vertical`() {
        assertThat(CaptureFlash.clamped(0.0)).isEqualTo(0.3)
        assertThat(CaptureFlash.clamped(5.0)).isEqualTo(1.0)
        assertThat(CaptureFlash.clamped(Double.NaN)).isEqualTo(1.0)
        assertThat(CaptureFlash.level(0f, 100f)).isEqualTo(1.0)
        assertThat(CaptureFlash.level(100f, 100f)).isWithin(1e-9).of(0.3)
        assertThat(CaptureFlash.level(10f, 0f)).isEqualTo(1.0)
        assertThat(CaptureFlash.thumbPosition(1.0)).isEqualTo(0f)
        assertThat(CaptureFlash.thumbPosition(0.3)).isEqualTo(1f)
        assertThat(CaptureFlash.stepped(0.95, true)).isEqualTo(1.0)
        assertThat(CaptureFlash.percent(0.456)).isEqualTo(46)
        assertThat(CaptureFlash.showsSlider(CaptureFlashMode.OFF)).isFalse()
        assertThat(CaptureFlash.showsSlider(CaptureFlashMode.ON)).isTrue()
    }

    @Test
    fun `zoom bar morphs while switching`() {
        val presets = listOf(0.5f, 1f, 2f)
        assertThat(CaptureZoomBarMorph.phase(true, presets, 1f)).isEqualTo(CaptureZoomBarMorph.Phase.Morphing)
        assertThat(CaptureZoomBarMorph.phase(false, presets, 1f)).isEqualTo(CaptureZoomBarMorph.Phase.Presets(presets))
        assertThat(CaptureZoomBarMorph.phase(false, listOf(1f), 3f)).isEqualTo(CaptureZoomBarMorph.Phase.Chip)
        assertThat(CaptureZoomBarMorph.phase(false, emptyList(), 1f)).isEqualTo(CaptureZoomBarMorph.Phase.Hidden)
    }

    @Test
    fun `the padlock seals once, only if it was showing, and lasts 0,6 s or 0,35 s`() {
        val sealed = CaptureLockSeal().lockChanged(from = false, to = true, wasShowing = true)
        assertThat(sealed.sealing).isTrue()
        assertThat(CaptureLockSeal().lockChanged(false, true, wasShowing = false).sealing).isFalse()
        assertThat(sealed.lockChanged(true, true, true)).isEqualTo(sealed)
        assertThat(sealed.finish(sealed.generation + 1)).isEqualTo(sealed)
        assertThat(sealed.finish(sealed.generation).sealing).isFalse()
        assertThat(sealed.lockChanged(true, false, true).sealing).isFalse()
        assertThat(CaptureLockSeal.showsTrack(false, sealed)).isTrue()
        assertThat(CaptureLockSeal.holdDurationMs(false)).isEqualTo(600)
        assertThat(CaptureLockSeal.holdDurationMs(true)).isEqualTo(350)
        assertThat(CaptureLockSeal.glyphScale(0.2f, true, false)).isEqualTo(1.3f)
        assertThat(CaptureLockSeal.glyphScale(0.2f, true, true)).isEqualTo(1f)
        assertThat(CaptureLockSeal.glyphScale(1f, false, false)).isWithin(1e-5f).of(1.15f)
    }
}

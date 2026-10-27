package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureDiscardAndTimerTest {
    private val one = listOf(CaptureSegment("a", "/a.mp4", 1.0))

    @Test
    fun `closing asks while recording, with pending segments, or when editing`() {
        assertThat(CaptureDiscardRule.asksBeforeClosing(CaptureStage.RECORDING, false, emptyList())).isTrue()
        assertThat(CaptureDiscardRule.asksBeforeClosing(CaptureStage.ARMED, false, one)).isTrue()
        assertThat(CaptureDiscardRule.asksBeforeClosing(CaptureStage.ARMED, true, emptyList())).isTrue()
        assertThat(CaptureDiscardRule.asksBeforeClosing(CaptureStage.ARMED, false, emptyList())).isFalse()
    }

    @Test
    fun `the prompt survives until a single answer consumes it`() {
        val asked = CaptureDiscardPrompt().ask(take = true, photo = false)
        assertThat(asked.isPresented).isTrue()
        val dismissed = asked.dismiss(nowMs = 100)
        assertThat(dismissed.isPresented).isFalse()
        assertThat(dismissed.request).isNotNull()
        val (answered, request) = dismissed.answer(nowMs = 120)
        assertThat(request).isEqualTo(CaptureDiscardPrompt.Request(take = true, photo = false))
        assertThat(answered.request).isNull()
        assertThat(answered.answer(nowMs = 130).second).isNull()
    }

    @Test
    fun `the tap that closes the alert is swallowed for a short window`() {
        val closed = CaptureDiscardPrompt().ask(true, true).dismiss(nowMs = 1_000)
        assertThat(closed.swallowsTap(nowMs = 1_100)).isTrue()
        assertThat(closed.swallowsTap(nowMs = 1_400)).isFalse()
        assertThat(CaptureDiscardPrompt().ask(true, true).swallowsTap(nowMs = 0)).isTrue()
    }

    @Test
    fun `slider appears on touch and expires only on the latest generation`() {
        val t0 = CaptureFlashSliderTimer().touch()
        val t1 = t0.touch()
        assertThat(t1.visible).isTrue()
        assertThat(t1.expire(t0.generation, voiceOver = false).visible).isTrue()
        assertThat(t1.expire(t1.generation, voiceOver = false).visible).isFalse()
    }

    @Test
    fun `a held or screen-reader slider never expires`() {
        val held = CaptureFlashSliderTimer().hold(true)
        assertThat(held.expire(held.generation, voiceOver = false).visible).isTrue()
        val released = held.hold(false)
        assertThat(released.expire(released.generation, voiceOver = true).visible).isTrue()
        assertThat(released.expire(released.generation, voiceOver = false).visible).isFalse()
    }

    @Test
    fun `hide clears the slider and invalidates pending deadlines`() {
        val t = CaptureFlashSliderTimer().touch()
        val hidden = t.hide()
        assertThat(hidden.visible).isFalse()
        assertThat(hidden.generation).isNotEqualTo(t.generation)
    }

    @Test
    fun `switch veil blurs and dims only while switching`() {
        assertThat(CameraSwitchVeil.blurRadiusDp(true)).isEqualTo(24f)
        assertThat(CameraSwitchVeil.blurRadiusDp(false)).isEqualTo(0f)
        assertThat(CameraSwitchVeil.opacity(true)).isEqualTo(0.7f)
        assertThat(CameraSwitchVeil.scale(true, reduceMotion = false)).isEqualTo(0.96f)
        assertThat(CameraSwitchVeil.scale(true, reduceMotion = true)).isEqualTo(1f)
        assertThat(CameraSwitchVeil.durationMs(true)).isEqualTo(120L)
        assertThat(CameraSwitchVeil.durationMs(false)).isEqualTo(250L)
    }
}

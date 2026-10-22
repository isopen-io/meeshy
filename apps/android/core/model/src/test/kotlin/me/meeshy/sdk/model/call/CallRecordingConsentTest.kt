package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRecordingConsentTest {
    private val request = CallRecordingRequested("c", "r1", "me", listOf("a", "b"), CallRecordingKind.AUDIO, expiresAtMillis = 30_000L)
    private val started = CallRecordingStarted("c", "r1", "me", CallRecordingKind.AUDIO)
    private val idle = CallRecordingConsentState.Idle

    private fun pending() = CallRecordingConsent.onRequested(idle, request)

    @Test
    fun `a request opens a pending state awaiting every required participant`() {
        val state = pending() as CallRecordingConsentState.Pending
        assertThat(state.awaiting).containsExactly("a", "b")
    }

    @Test
    fun `started without a prior request never records (fail closed)`() {
        val state = CallRecordingConsent.onStarted(idle, started)
        assertThat(state).isEqualTo(idle)
        assertThat(CallRecordingConsent.mayCapture(state, "me")).isFalse()
    }

    @Test
    fun `started for another recording id is ignored`() {
        val state = CallRecordingConsent.onStarted(pending(), started.copy(recordingId = "other"))
        assertThat(state).isInstanceOf(CallRecordingConsentState.Pending::class.java)
    }

    @Test
    fun `a refusal from any required participant blocks the start`() {
        val refused = CallRecordingConsent.onAnswer(CallRecordingConsent.onAnswer(pending(), "a", true), "b", false)
        val state = CallRecordingConsent.onStarted(refused, started)
        assertThat(CallRecordingConsent.isRecording(state)).isFalse()
    }

    @Test
    fun `started after the request records and only the designated recorder captures`() {
        val state = CallRecordingConsent.onStarted(pending(), started)
        assertThat(CallRecordingConsent.isRecording(state)).isTrue()
        assertThat(CallRecordingConsent.mayCapture(state, "me")).isTrue()
        assertThat(CallRecordingConsent.mayCapture(state, "a")).isFalse()
    }

    @Test
    fun `an answer from someone not required is ignored`() {
        val state = CallRecordingConsent.onAnswer(pending(), "stranger", false) as CallRecordingConsentState.Pending
        assertThat(state.refused).isFalse()
    }

    @Test
    fun `the request expires at its deadline`() {
        assertThat(CallRecordingConsent.onTick(pending(), 29_999L)).isInstanceOf(CallRecordingConsentState.Pending::class.java)
        val ended = CallRecordingConsent.onTick(pending(), 30_000L) as CallRecordingConsentState.Ended
        assertThat(ended.stopped.reason).isEqualTo("timeout")
    }

    @Test
    fun `stopped ends a pending or running recording and a second request while pending is ignored`() {
        val stopped = CallRecordingStopped("c", "r1", "stopped", "me", true)
        val recording = CallRecordingConsent.onStarted(pending(), started)
        assertThat(CallRecordingConsent.onStopped(recording, stopped)).isInstanceOf(CallRecordingConsentState.Ended::class.java)
        assertThat(CallRecordingConsent.onStopped(pending(), stopped.copy(recordingId = "zz"))).isInstanceOf(CallRecordingConsentState.Pending::class.java)
        assertThat(CallRecordingConsent.onRequested(pending(), request.copy(recordingId = "r2"))).isEqualTo(pending())
    }

    @Test
    fun `reduce folds socket events`() {
        val state = listOf(
            CallRecordingSocketEvent.Requested(request),
            CallRecordingSocketEvent.Started(started),
        ).fold(idle as CallRecordingConsentState, CallRecordingConsent::reduce)
        assertThat(CallRecordingConsent.isRecording(state)).isTrue()
    }
}

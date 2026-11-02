package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallRecordingRulesTest {
    private val idle = CallRecordingState()

    private fun requested(
        requester: String = "peer",
        required: List<String> = listOf("me"),
        kind: CallRecordingKind = CallRecordingKind.AUDIO,
        callId: String = "c1",
    ) = CallRecordingSocketEvent.Requested(CallRecordingRequested(callId, "r1", requester, required, kind, null))

    private fun started(recorder: String = "me", callId: String = "c1", kind: CallRecordingKind = CallRecordingKind.AUDIO) =
        CallRecordingSocketEvent.Started(CallRecordingStarted(callId, "r1", recorder, kind))

    private fun stopped(reason: String = "refused", wasRecording: Boolean = false, id: String = "r1", callId: String = "c1") =
        CallRecordingSocketEvent.Stopped(CallRecordingStopped(callId, id, reason, null, wasRecording))

    private fun receive(state: CallRecordingState, event: CallRecordingSocketEvent, call: String? = "c1", viewer: String? = "me") =
        CallRecordingRules.onSocketEvent(state, event, call, viewer)

    @Test
    fun `a request naming me as a required consenter asks me to answer`() {
        val reduction = receive(idle, requested())
        val phase = reduction.state.phase as CallRecordingPhase.Pending
        assertThat(phase.mustAnswer).isTrue()
        assertThat(phase.mine).isFalse()
        assertThat(reduction.capture).isEqualTo(CallRecordingCapture.None)
    }

    @Test
    fun `my own request waits without being asked to answer`() {
        val phase = receive(idle, requested(requester = "me", required = listOf("peer"))).state.phase as CallRecordingPhase.Pending
        assertThat(phase.mine).isTrue()
        assertThat(phase.mustAnswer).isFalse()
    }

    @Test
    fun `a request for a video recording is remembered so the card says it`() {
        assertThat(receive(idle, requested(kind = CallRecordingKind.VIDEO)).state.kind).isEqualTo(CallRecordingKind.VIDEO)
    }

    @Test
    fun `a broadcast of another call is ignored`() {
        val reduction = receive(idle, requested(callId = "other"))
        assertThat(reduction.state).isEqualTo(idle)
        assertThat(receive(idle, requested(), call = null).state).isEqualTo(idle)
    }

    @Test
    fun `capture starts only when the broadcast names me as the recorder`() {
        val pending = receive(idle, requested(requester = "me", required = listOf("peer"))).state
        val mine = receive(pending, started(recorder = "me"))
        assertThat(mine.capture).isEqualTo(CallRecordingCapture.Begin("c1", "r1", CallRecordingKind.AUDIO))
        assertThat(mine.state.phase).isEqualTo(CallRecordingPhase.Recording("c1", "r1", "me", mine = true))
        assertThat(mine.state.capturingRecordingId).isEqualTo("r1")

        val theirs = receive(pending, started(recorder = "peer"))
        assertThat(theirs.capture).isEqualTo(CallRecordingCapture.None)
        assertThat(theirs.state.phase).isEqualTo(CallRecordingPhase.Recording("c1", "r1", "peer", mine = false))
        assertThat(theirs.state.capturingRecordingId).isNull()
    }

    @Test
    fun `a second started for a running capture does not begin another`() {
        val first = receive(idle, started()).state
        assertThat(receive(first, started()).capture).isEqualTo(CallRecordingCapture.None)
    }

    @Test
    fun `any stop of the running recording ends the capture and leaves a notice`() {
        val recording = receive(idle, started()).state
        val reduction = receive(recording, stopped(reason = "participant-joined", wasRecording = true))
        assertThat(reduction.state.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(reduction.state.capturingRecordingId).isNull()
        assertThat(reduction.state.notice).isEqualTo(CallRecordingNotice.Stopped("participant-joined", true))
        assertThat(reduction.capture).isEqualTo(CallRecordingCapture.Finish)
    }

    @Test
    fun `a refusal stops a pending request without capture`() {
        val pending = receive(idle, requested()).state
        val reduction = receive(pending, stopped(reason = "refused"))
        assertThat(reduction.state.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(reduction.state.notice).isEqualTo(CallRecordingNotice.Stopped("refused", false))
        assertThat(reduction.capture).isEqualTo(CallRecordingCapture.None)
    }

    @Test
    fun `a stop of an unknown recording is ignored`() {
        val pending = receive(idle, requested()).state
        assertThat(receive(pending, stopped(id = "zzz")).state).isEqualTo(pending)
    }

    @Test
    fun `asking opens only from idle and only with a call`() {
        val asking = CallRecordingRules.ask(idle, "c1", CallRecordingKind.VIDEO)!!
        assertThat(asking.phase).isEqualTo(CallRecordingPhase.Asking("c1"))
        assertThat(asking.kind).isEqualTo(CallRecordingKind.VIDEO)
        assertThat(CallRecordingRules.ask(asking, "c1", CallRecordingKind.AUDIO)).isNull()
        assertThat(CallRecordingRules.ask(idle, null, CallRecordingKind.AUDIO)).isNull()
    }

    @Test
    fun `an accepted request moves to waiting for everyone`() {
        val asking = CallRecordingRules.ask(idle, "c1", CallRecordingKind.AUDIO)!!
        val waiting = CallRecordingRules.askAccepted(asking, "c1", "r1", "me")
        assertThat(waiting.phase).isEqualTo(CallRecordingPhase.Pending("c1", "r1", "me", mine = true, mustAnswer = false))
    }

    @Test
    fun `an accepted request whose ask was cancelled meanwhile changes nothing`() {
        assertThat(CallRecordingRules.askAccepted(idle, "c1", "r1", "me")).isEqualTo(idle)
    }

    @Test
    fun `a refused request returns to idle with the refusal code`() {
        val asking = CallRecordingRules.ask(idle, "c1", CallRecordingKind.AUDIO)!!
        val refused = CallRecordingRules.askRefused(asking, "c1", "NO_PEER_TO_CONSENT")
        assertThat(refused.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(refused.notice).isEqualTo(CallRecordingNotice.Unavailable("NO_PEER_TO_CONSENT"))
    }

    @Test
    fun `answering clears the obligation to answer`() {
        val pending = receive(idle, requested()).state
        val answered = CallRecordingRules.answered(pending)
        assertThat((answered.phase as CallRecordingPhase.Pending).mustAnswer).isFalse()
        assertThat(CallRecordingRules.mayAnswer(pending)).isTrue()
        assertThat(CallRecordingRules.mayAnswer(answered)).isFalse()
    }

    @Test
    fun `stopping a recording ends capture and names the target to tell the gateway`() {
        val recording = receive(idle, started()).state
        val stop = CallRecordingRules.stop(recording)
        assertThat(stop.state.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(stop.state.notice).isEqualTo(CallRecordingNotice.Stopped("stopped", true))
        assertThat(stop.capture).isEqualTo(CallRecordingCapture.Finish)
        assertThat(stop.emitStopFor).isEqualTo("c1" to "r1")
    }

    @Test
    fun `cancelling while asking tells nobody`() {
        val asking = CallRecordingRules.ask(idle, "c1", CallRecordingKind.AUDIO)!!
        val stop = CallRecordingRules.stop(asking)
        assertThat(stop.state.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(stop.emitStopFor).isNull()
    }

    @Test
    fun `stopping when idle does nothing`() {
        assertThat(CallRecordingRules.stop(idle).emitStopFor).isNull()
    }

    @Test
    fun `the end of the call switches everything off silently`() {
        val recording = receive(idle, started()).state
        val ended = CallRecordingRules.callEnded(recording)
        assertThat(ended.state.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(ended.capture).isEqualTo(CallRecordingCapture.Finish)
        assertThat(CallRecordingRules.callEnded(idle).capture).isEqualTo(CallRecordingCapture.None)
    }

    @Test
    fun `a capture that cannot start gives up and tells the gateway`() {
        val recording = receive(idle, started()).state
        val failed = CallRecordingRules.captureFailed(recording)
        assertThat(failed.state.phase).isEqualTo(CallRecordingPhase.Idle)
        assertThat(failed.state.notice).isEqualTo(CallRecordingNotice.SaveFailed)
        assertThat(failed.emitStopFor).isEqualTo("c1" to "r1")
    }

    @Test
    fun `the consent window of 30 seconds is the shared one`() {
        assertThat(CallRecordingRules.CONSENT_TIMEOUT_MILLIS).isEqualTo(30_000L)
    }

    @Test
    fun `admission needs an established call and refuses end to end conversations`() {
        assertThat(CallRecordingRules.admission(connected = true, callId = "c1", endToEnd = false))
            .isEqualTo(CallRecordingAdmission.Allowed)
        assertThat(CallRecordingRules.admission(connected = false, callId = "c1", endToEnd = false))
            .isEqualTo(CallRecordingAdmission.NotEstablished)
        assertThat(CallRecordingRules.admission(connected = true, callId = null, endToEnd = false))
            .isEqualTo(CallRecordingAdmission.NotEstablished)
        assertThat(CallRecordingRules.admission(connected = true, callId = "c1", endToEnd = true))
            .isEqualTo(CallRecordingAdmission.EndToEnd)
    }

    @Test
    fun `only the e2ee encryption mode is end to end`() {
        assertThat(CallRecordingRules.isEndToEnd("e2ee")).isTrue()
        assertThat(CallRecordingRules.isEndToEnd("E2EE")).isTrue()
        assertThat(CallRecordingRules.isEndToEnd("hybrid")).isFalse()
        assertThat(CallRecordingRules.isEndToEnd("server")).isFalse()
        assertThat(CallRecordingRules.isEndToEnd(null)).isFalse()
    }
}

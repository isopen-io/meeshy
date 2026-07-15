package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.waveform.WaveformLevelWindow
import org.junit.Test

class VoiceRecordingSessionTest {

    // region — lifecycle transitions

    @Test
    fun `idle session is not recording and cannot send`() {
        val session = VoiceRecordingSession.idle()

        assertThat(session.phase).isEqualTo(VoiceRecordingPhase.Idle)
        assertThat(session.isRecording).isFalse()
        assertThat(session.canSend).isFalse()
        assertThat(session.elapsedSeconds).isEqualTo(0.0)
    }

    @Test
    fun `start moves an idle session into recording from zero`() {
        val session = VoiceRecordingSession.idle().start()

        assertThat(session.phase).isEqualTo(VoiceRecordingPhase.Recording)
        assertThat(session.isRecording).isTrue()
        assertThat(session.elapsedSeconds).isEqualTo(0.0)
    }

    @Test
    fun `start while already recording is inert and preserves elapsed`() {
        val recording = VoiceRecordingSession.idle().start().tick(2.0)

        val again = recording.start()

        assertThat(again.elapsedSeconds).isEqualTo(2.0)
        assertThat(again.isRecording).isTrue()
    }

    @Test
    fun `cancel returns a fresh idle session that discards elapsed and levels`() {
        val recording = VoiceRecordingSession.idle().start().tick(3.0).meter(0f)

        val cancelled = recording.cancel()

        assertThat(cancelled.isRecording).isFalse()
        assertThat(cancelled.elapsedSeconds).isEqualTo(0.0)
        assertThat(cancelled.levels).containsNoneIn(listOf(1f))
    }

    @Test
    fun `cancel on an already-idle session is idempotent`() {
        val idle = VoiceRecordingSession.idle()

        assertThat(idle.cancel().isRecording).isFalse()
        assertThat(idle.cancel().elapsedSeconds).isEqualTo(0.0)
    }

    // endregion

    // region — timer (tick)

    @Test
    fun `tick advances elapsed while recording and accumulates`() {
        val session = VoiceRecordingSession.idle().start().tick(0.1).tick(0.1)

        assertThat(session.elapsedSeconds).isWithin(1e-9).of(0.2)
    }

    @Test
    fun `tick is inert on an idle session`() {
        val idle = VoiceRecordingSession.idle()

        assertThat(idle.tick(0.5).elapsedSeconds).isEqualTo(0.0)
        assertThat(idle.tick(0.5).isRecording).isFalse()
    }

    @Test
    fun `tick with a non-positive delta is inert`() {
        val recording = VoiceRecordingSession.idle().start().tick(1.0)

        assertThat(recording.tick(0.0).elapsedSeconds).isEqualTo(1.0)
        assertThat(recording.tick(-0.5).elapsedSeconds).isEqualTo(1.0)
    }

    // endregion

    // region — min-duration gating (canSend)

    @Test
    fun `cannot send below the minimum sendable duration`() {
        val short = VoiceRecordingSession.idle().start().tick(0.49)

        assertThat(short.canSend).isFalse()
    }

    @Test
    fun `can send exactly at the minimum sendable duration boundary`() {
        val atFloor = VoiceRecordingSession.idle().start()
            .tick(VoiceRecordingSession.MINIMUM_SENDABLE_SECONDS)

        assertThat(atFloor.canSend).isTrue()
    }

    @Test
    fun `can send above the minimum sendable duration`() {
        val long = VoiceRecordingSession.idle().start().tick(3.0)

        assertThat(long.canSend).isTrue()
    }

    // endregion

    // region — stop outcomes

    @Test
    fun `stop below the minimum discards as too short and returns to idle`() {
        val short = VoiceRecordingSession.idle().start().tick(0.3)

        val stop = short.stop()

        assertThat(stop.outcome).isEqualTo(VoiceRecordingOutcome.TooShort)
        assertThat(stop.session.isRecording).isFalse()
        assertThat(stop.session.elapsedSeconds).isEqualTo(0.0)
    }

    @Test
    fun `stop at or above the minimum completes with duration and levels`() {
        val session = VoiceRecordingSession.idle().start().tick(1.25).meter(-10f)

        val stop = session.stop()

        val outcome = stop.outcome
        assertThat(outcome).isInstanceOf(VoiceRecordingOutcome.Completed::class.java)
        outcome as VoiceRecordingOutcome.Completed
        assertThat(outcome.durationSeconds).isWithin(1e-9).of(1.25)
        assertThat(outcome.levels).isEqualTo(session.levels)
        assertThat(stop.session.isRecording).isFalse()
    }

    @Test
    fun `stop exactly at the minimum boundary completes rather than discarding`() {
        val atFloor = VoiceRecordingSession.idle().start()
            .tick(VoiceRecordingSession.MINIMUM_SENDABLE_SECONDS)

        assertThat(atFloor.stop().outcome).isInstanceOf(VoiceRecordingOutcome.Completed::class.java)
    }

    @Test
    fun `stop on an idle session is inactive`() {
        val stop = VoiceRecordingSession.idle().stop()

        assertThat(stop.outcome).isEqualTo(VoiceRecordingOutcome.Inactive)
        assertThat(stop.session.isRecording).isFalse()
    }

    // endregion

    // region — waveform metering

    @Test
    fun `meter pushes a normalized loud reading toward the top of the strip`() {
        val session = VoiceRecordingSession.idle().start().meter(0f)

        assertThat(session.levels.last()).isWithin(1e-6f).of(1f)
    }

    @Test
    fun `meter pushes a floor reading as silence`() {
        val session = VoiceRecordingSession.idle().start().meter(-50f)

        assertThat(session.levels.last()).isWithin(1e-6f).of(0f)
    }

    @Test
    fun `meter is inert on an idle session`() {
        val idle = VoiceRecordingSession.idle()

        assertThat(idle.meter(0f).levels).isEqualTo(idle.levels)
    }

    @Test
    fun `the level window never grows past its capacity`() {
        var session = VoiceRecordingSession.idle(levelCapacity = 4).start()
        repeat(10) { session = session.meter(0f) }

        assertThat(session.levels).hasSize(4)
    }

    @Test
    fun `a zero-capacity window keeps an empty strip and meter stays inert`() {
        val session = VoiceRecordingSession.idle(levelCapacity = 0).start().meter(0f)

        assertThat(session.levels).isEmpty()
    }

    // endregion

    // region — timer formatting

    @Test
    fun `formatted elapsed pads seconds and truncates fractional seconds`() {
        val session = VoiceRecordingSession.idle().start().tick(5.9)

        assertThat(session.formattedElapsed).isEqualTo("0:05")
    }

    @Test
    fun `formatted elapsed rolls minutes over at sixty seconds`() {
        val session = VoiceRecordingSession.idle().start().tick(65.0)

        assertThat(session.formattedElapsed).isEqualTo("1:05")
    }

    @Test
    fun `formatted elapsed renders multi-minute recordings`() {
        val session = VoiceRecordingSession.idle().start().tick(600.0)

        assertThat(session.formattedElapsed).isEqualTo("10:00")
    }

    // endregion

    // region — recording dot blink

    @Test
    fun `recording dot is fully opaque in the first half of each second`() {
        val session = VoiceRecordingSession.idle().start().tick(0.2)

        assertThat(session.recordingDotOpacity(reduceMotion = false)).isEqualTo(1f)
    }

    @Test
    fun `recording dot dims in the second half of each second`() {
        val session = VoiceRecordingSession.idle().start().tick(0.7)

        assertThat(session.recordingDotOpacity(reduceMotion = false)).isEqualTo(0.3f)
    }

    @Test
    fun `recording dot blink resets each whole second`() {
        val session = VoiceRecordingSession.idle().start().tick(1.2)

        assertThat(session.recordingDotOpacity(reduceMotion = false)).isEqualTo(1f)
    }

    @Test
    fun `reduce motion pins the recording dot fully opaque regardless of elapsed`() {
        val session = VoiceRecordingSession.idle().start().tick(0.7)

        assertThat(session.recordingDotOpacity(reduceMotion = true)).isEqualTo(1f)
    }

    // endregion

    // region — immutability

    @Test
    fun `transitions never mutate the source session`() {
        val recording = VoiceRecordingSession.idle().start().tick(1.0)

        recording.tick(5.0)
        recording.meter(0f)
        recording.stop()
        recording.cancel()

        assertThat(recording.elapsedSeconds).isEqualTo(1.0)
        assertThat(recording.isRecording).isTrue()
    }

    @Test
    fun `a fresh idle session seeds a flat capacity-sized strip`() {
        val session = VoiceRecordingSession.idle(levelCapacity = WaveformLevelWindow.DEFAULT_CAPACITY)

        assertThat(session.levels).hasSize(WaveformLevelWindow.DEFAULT_CAPACITY)
        assertThat(session.levels.toSet()).containsExactly(0f)
    }

    // endregion
}

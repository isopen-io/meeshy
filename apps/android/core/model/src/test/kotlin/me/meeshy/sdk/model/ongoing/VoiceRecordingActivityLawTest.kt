package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceRecordingActivityLawTest {

    private val wording = VoiceRecordingActivityLaw.Wording(recording = "Enregistrement vocal")

    private fun input(recording: Boolean = true, startedAt: Long = 1_000L) =
        VoiceRecordingActivityLaw.Input(isRecording = recording, startedAtEpochMs = startedAt)

    @Test
    fun `no recording opens nothing`() {
        val step = VoiceRecordingActivityLaw.step(null, input(recording = false), wording)

        assertThat(step.action).isEqualTo(VoiceRecordingActivityLaw.Action.None)
        assertThat(step.running).isNull()
    }

    @Test
    fun `a recording opens the activity anchored on its start`() {
        val start = VoiceRecordingActivityLaw.step(null, input(startedAt = 42L), wording)
            .action as VoiceRecordingActivityLaw.Action.Start

        assertThat(start.snapshot.startedAtEpochMs).isEqualTo(42L)
        assertThat(start.snapshot.statusLabel).isEqualTo("Enregistrement vocal")
        assertThat(start.snapshot.isFinished).isFalse()
    }

    @Test
    fun `the running recording never wakes the notification`() {
        val first = VoiceRecordingActivityLaw.step(null, input(), wording)

        assertThat(VoiceRecordingActivityLaw.step(first.running, input(), wording).action)
            .isEqualTo(VoiceRecordingActivityLaw.Action.None)
    }

    @Test
    fun `stopping ends the activity at once with a finished snapshot`() {
        val first = VoiceRecordingActivityLaw.step(null, input(), wording)

        val step = VoiceRecordingActivityLaw.step(first.running, input(recording = false), wording)
        val end = step.action as VoiceRecordingActivityLaw.Action.End
        assertThat(end.snapshot.isFinished).isTrue()
        assertThat(step.running).isNull()
    }

    @Test
    fun `a new take replaces the previous activity`() {
        val first = VoiceRecordingActivityLaw.step(null, input(startedAt = 1L), wording)

        val next = VoiceRecordingActivityLaw.step(first.running, input(startedAt = 2L), wording)
        assertThat(next.action).isInstanceOf(VoiceRecordingActivityLaw.Action.Start::class.java)
    }

    @Test
    fun `a language change relabels the running activity`() {
        val first = VoiceRecordingActivityLaw.step(null, input(), wording)

        val step = VoiceRecordingActivityLaw.step(first.running, input(), VoiceRecordingActivityLaw.Wording("Voice recording"))
        assertThat((step.action as VoiceRecordingActivityLaw.Action.Update).snapshot.statusLabel).isEqualTo("Voice recording")
    }
}

package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceRecordingActivityLevelTest {

    private val wording = VoiceRecordingActivityLaw.Wording("Enregistrement")

    private fun input(
        recording: Boolean = true,
        started: Long = 1_000L,
        title: String = "Famille",
        levels: List<Float> = emptyList(),
        now: Long = 0L,
    ) = VoiceRecordingActivityLaw.Input(recording, started, title, levels, now)

    private fun open(levels: List<Float> = emptyList(), now: Long = 0L): VoiceRecordingSnapshot {
        val step = VoiceRecordingActivityLaw.step(null, input(levels = levels, now = now), wording)
        return (step.action as VoiceRecordingActivityLaw.Action.Start).snapshot
    }

    @Test
    fun `a take opens with the status label, the conversation title and the level`() {
        val snapshot = open(levels = listOf(1f, 1f))

        assertThat(snapshot.statusLabel).isEqualTo("Enregistrement")
        assertThat(snapshot.title).isEqualTo("Famille")
        assertThat(snapshot.level).isEqualTo(VoiceRecordingActivityLaw.MAX_LEVEL)
    }

    @Test
    fun `the level is the quantized mean clamped to the scale`() {
        assertThat(VoiceRecordingActivityLaw.quantizedLevel(emptyList())).isEqualTo(0)
        assertThat(VoiceRecordingActivityLaw.quantizedLevel(listOf(0.5f))).isEqualTo(2)
        assertThat(VoiceRecordingActivityLaw.quantizedLevel(listOf(7f))).isEqualTo(VoiceRecordingActivityLaw.MAX_LEVEL)
        assertThat(VoiceRecordingActivityLaw.quantizedLevel(listOf(-3f))).isEqualTo(0)
    }

    @Test
    fun `a level change inside the same second does not wake the notification`() {
        val running = open(levels = listOf(0f), now = 0L)

        val step = VoiceRecordingActivityLaw.step(running, input(levels = listOf(1f), now = 999L), wording)

        assertThat(step.action).isEqualTo(VoiceRecordingActivityLaw.Action.None)
        assertThat(step.running).isEqualTo(running)
    }

    @Test
    fun `a level change a second later updates the notification`() {
        val running = open(levels = listOf(0f), now = 0L)

        val step = VoiceRecordingActivityLaw.step(running, input(levels = listOf(1f), now = 1_000L), wording)

        val update = step.action as VoiceRecordingActivityLaw.Action.Update
        assertThat(update.snapshot.level).isEqualTo(VoiceRecordingActivityLaw.MAX_LEVEL)
        assertThat(step.running?.lastUpdateEpochMs).isEqualTo(1_000L)
    }

    @Test
    fun `an unchanged level never updates`() {
        val running = open(levels = listOf(0.5f), now = 0L)

        val step = VoiceRecordingActivityLaw.step(running, input(levels = listOf(0.5f), now = 5_000L), wording)

        assertThat(step.action).isEqualTo(VoiceRecordingActivityLaw.Action.None)
    }

    @Test
    fun `a new title updates immediately`() {
        val running = open(now = 0L)

        val step = VoiceRecordingActivityLaw.step(running, input(title = "Travail", now = 10L), wording)

        assertThat(step.action).isInstanceOf(VoiceRecordingActivityLaw.Action.Update::class.java)
    }

    @Test
    fun `a new take start restarts the notification`() {
        val running = open()

        val step = VoiceRecordingActivityLaw.step(running, input(started = 2_000L), wording)

        assertThat(step.action).isInstanceOf(VoiceRecordingActivityLaw.Action.Start::class.java)
    }

    @Test
    fun `the end closes immediately with a finished silent snapshot`() {
        val running = open(levels = listOf(1f))

        val step = VoiceRecordingActivityLaw.step(running, input(recording = false), wording)

        val end = step.action as VoiceRecordingActivityLaw.Action.End
        assertThat(end.snapshot.isFinished).isTrue()
        assertThat(end.snapshot.level).isEqualTo(0)
        assertThat(step.running).isNull()
        assertThat(VoiceRecordingActivityLaw.step(null, null, wording).action).isEqualTo(VoiceRecordingActivityLaw.Action.None)
    }
}

package me.meeshy.sdk.model.ongoing

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LiveActivityPlanTest {

    private val labels = LiveActivityLabels(
        publicText = "public",
        protectedMessage = "protected",
        waitingNetwork = "waiting",
        pause = "pause",
        resume = "resume",
        close = "close",
        stop = "stop",
        cancel = "cancel",
        hangUp = "hangup",
        mute = "mute",
        unmute = "unmute",
        sentOfTotal = { sent, total -> "$sent/$total" },
        remaining = { "$it left" },
    )

    private fun outbox(phase: OutboxActivityPhase = OutboxActivityPhase.Sending, sent: Int = 1, total: Int = 3, remaining: Int = 2) =
        OutboxActivitySnapshot(phase, remaining, "Sending media", sent, total)

    @Test
    fun `outbox shows sent over total with a bounded progress and a cancel action`() {
        val plan = LiveActivityPlans.outbox(outbox(), labels)
        assertThat(plan.detail).isEqualTo("1/3")
        assertThat(plan.progress).isWithin(1e-9).of(1.0 / 3.0)
        assertThat(plan.actions.map { it.command }).containsExactly(LiveActivityCommand.OutboxCancel)
        assertThat(plan.isOngoing).isTrue()
    }

    @Test
    fun `a single send has an indeterminate bar`() {
        val plan = LiveActivityPlans.outbox(outbox(sent = 0, total = 1, remaining = 1), labels)
        assertThat(plan.indeterminate).isTrue()
        assertThat(plan.progress).isNull()
    }

    @Test
    fun `waiting for the network says so without progress`() {
        val plan = LiveActivityPlans.outbox(outbox(OutboxActivityPhase.WaitingForNetwork), labels)
        assertThat(plan.detail).isEqualTo("waiting")
        assertThat(plan.progress).isNull()
        assertThat(plan.indeterminate).isFalse()
    }

    @Test
    fun `the outcome of a send is not ongoing and has no action`() {
        val plan = LiveActivityPlans.outbox(outbox(OutboxActivityPhase.Sent, sent = 3, total = 3, remaining = 0), labels)
        assertThat(plan.isOngoing).isFalse()
        assertThat(plan.actions).isEmpty()
        assertThat(plan.isError).isFalse()
        val failed = LiveActivityPlans.outbox(outbox(OutboxActivityPhase.Failed, remaining = 0), labels)
        assertThat(failed.isError).isTrue()
    }

    @Test
    fun `an over-reported sent count is bounded`() {
        val plan = LiveActivityPlans.outbox(outbox(sent = 9, total = 3), labels)
        assertThat(plan.progress).isAtMost(1.0)
        assertThat(plan.detail).isEqualTo("3/3")
    }

    @Test
    fun `recording shows a chronometer with stop and cancel and ends without action`() {
        val live = LiveActivityPlans.recording(VoiceRecordingSnapshot(1_000L, "Voice", false), labels)
        assertThat(live.chronometerFromEpochMs).isEqualTo(1_000L)
        assertThat(live.actions.map { it.command })
            .containsExactly(LiveActivityCommand.RecordingStop, LiveActivityCommand.RecordingCancel).inOrder()
        val done = LiveActivityPlans.recording(VoiceRecordingSnapshot(1_000L, "Voice", true), labels)
        assertThat(done.isOngoing).isFalse()
        assertThat(done.actions).isEmpty()
    }

    @Test
    fun `playback progress is clamped between 0 and 1`() {
        fun progress(position: Long, duration: Long) =
            LiveActivityPlans.playback(VoicePlaybackSnapshot("a", "b", true, position, duration), labels).progress
        assertThat(progress(5_000, 10_000)).isWithin(1e-9).of(0.5)
        assertThat(progress(-5, 10_000)).isEqualTo(0.0)
        assertThat(progress(20_000, 10_000)).isEqualTo(1.0)
        assertThat(progress(1, 0)).isNull()
    }

    @Test
    fun `playback offers pause or resume and close`() {
        val playing = LiveActivityPlans.playback(VoicePlaybackSnapshot("a", "b", true, 0, 10), labels)
        assertThat(playing.actions.map { it.label }).containsExactly("pause", "close").inOrder()
        val paused = LiveActivityPlans.playback(VoicePlaybackSnapshot("a", "b", false, 0, 10), labels)
        assertThat(paused.actions.first().label).isEqualTo("resume")
    }

    @Test
    fun `a protected voice message never shows its conversation`() {
        val plan = LiveActivityPlans.playback(VoicePlaybackSnapshot("Alice", "Secret chat", true, 0, 10, isProtected = true), labels)
        assertThat(plan.detail).isEqualTo("protected")
    }

    private fun call(phase: CallActivityPhase, muted: Boolean = false, since: Long? = 500L) = CallActivitySnapshot(
        phase = phase, title = "Bob", statusLabel = "status", initials = "B", isVideo = false, isMuted = muted,
        connectedSinceEpochMs = since, showsDurationInCompact = true, caption = null,
    )

    @Test
    fun `an active call offers hang up and a mute toggle with a chronometer once connected`() {
        val plan = LiveActivityPlans.call(call(CallActivityPhase.Connected, muted = true), labels)
        assertThat(plan.actions.map { it.label }).containsExactly("hangup", "unmute").inOrder()
        assertThat(plan.chronometerFromEpochMs).isEqualTo(500L)
        assertThat(LiveActivityPlans.call(call(CallActivityPhase.Connecting), labels).chronometerFromEpochMs).isNull()
    }

    @Test
    fun `an ended call ends the notification`() {
        val plan = LiveActivityPlans.call(call(CallActivityPhase.Ended), labels)
        assertThat(plan.isOngoing).isFalse()
        assertThat(plan.actions).isEmpty()
    }

    @Test
    fun `command wire names round trip and unknown names are tolerated`() {
        LiveActivityCommand.entries.forEach { assertThat(LiveActivityCommand.fromWireName(it.wireName)).isEqualTo(it) }
        assertThat(LiveActivityCommand.fromWireName("nope")).isNull()
    }
}

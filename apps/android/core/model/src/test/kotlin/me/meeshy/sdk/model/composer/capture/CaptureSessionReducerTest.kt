package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CaptureSessionReducerTest {
    private fun run(start: CaptureSessionState = CaptureSessionState(armedAtMs = 0), vararg events: CaptureEvent): CaptureStep {
        var step = CaptureStep(start)
        val all = mutableListOf<CaptureEffect>()
        events.forEach { step = CaptureSessionReducer.reduce(step.state, it); all += step.effects }
        return CaptureStep(step.state, all)
    }

    private fun CaptureStep.has(e: CaptureEffect) = assertThat(effects).contains(e)

    @Test
    fun `a single shutter tap takes a photo and opens a ledger token`() {
        val step = run(events = arrayOf(CaptureEvent.ShutterTapped(1_000)))
        assertThat(step.effects.filterIsInstance<CaptureEffect.TakePhoto>()).hasSize(1)
        assertThat(step.state.ledger.pending).hasSize(1)
    }

    @Test
    fun `holding records, releasing closes the take`() {
        val step = run(
            events = arrayOf(
                CaptureEvent.HoldBegan, CaptureEvent.RecordingStarted("video-1"), CaptureEvent.HoldReleased,
            ),
        )
        step.has(CaptureEffect.StartRecording("video-1"))
        step.has(CaptureEffect.StopRecording)
        assertThat(step.state.holding).isFalse()
    }

    @Test
    fun `sliding right locks and the take survives the release`() {
        val step = run(
            events = arrayOf(
                CaptureEvent.HoldBegan, CaptureEvent.RecordingStarted("video-1"),
                CaptureEvent.HoldDragged(70f), CaptureEvent.HoldReleased,
            ),
        )
        assertThat(step.state.locked).isTrue()
        assertThat(step.effects).doesNotContain(CaptureEffect.StopRecording)
        assertThat(step.state.stage).isEqualTo(CaptureStage.RECORDING)
    }

    @Test
    fun `the lock never undoes when the finger comes back`() {
        val step = run(events = arrayOf(CaptureEvent.HoldBegan, CaptureEvent.RecordingStarted("v"), CaptureEvent.HoldDragged(70f), CaptureEvent.HoldDragged(0f)))
        assertThat(step.state.locked).isTrue()
    }

    @Test
    fun `a locked take stops on a shutter tap`() {
        val step = run(
            events = arrayOf(
                CaptureEvent.HoldBegan, CaptureEvent.RecordingStarted("v"), CaptureEvent.HoldDragged(70f),
                CaptureEvent.HoldReleased, CaptureEvent.ShutterTapped(5_000),
            ),
        )
        step.has(CaptureEffect.StopRecording)
    }

    @Test
    fun `releasing before the camera started cancels the pending recording`() {
        val step = run(events = arrayOf(CaptureEvent.HoldBegan, CaptureEvent.HoldReleased))
        step.has(CaptureEffect.CancelPendingRecording)
    }

    @Test
    fun `a written segment lands in the list and the lock resets`() {
        val step = run(
            events = arrayOf(
                CaptureEvent.HoldBegan, CaptureEvent.RecordingStarted("video-1"), CaptureEvent.HoldDragged(70f),
                CaptureEvent.SegmentWritten("video-1", "/a.mp4", 2.0),
            ),
        )
        assertThat(step.state.segments.map { it.path }).containsExactly("/a.mp4")
        assertThat(step.state.stage).isEqualTo(CaptureStage.ARMED)
        assertThat(step.state.locked).isFalse()
        assertThat(step.state.ledger.delivered).containsExactly("video-1")
    }

    @Test
    fun `a lost take is reported, not forgotten`() {
        val step = run(events = arrayOf(CaptureEvent.HoldBegan, CaptureEvent.RecordingFailed("video-1")))
        assertThat(step.state.ledger.hasLostTake).isTrue()
        assertThat(step.state.holding).isFalse()
    }

    @Test
    fun `with pending segments the double tap no longer photographs`() {
        val start = CaptureSessionState(armedAtMs = 0, segments = listOf(CaptureSegment("a", "/a.mp4", 1.0)))
        val step = run(start, CaptureEvent.ShutterTapped(1_000))
        assertThat(step.effects.filterIsInstance<CaptureEffect.TakePhoto>()).isEmpty()
    }

    @Test
    fun `dropping deletes exactly the last file`() {
        val start = CaptureSessionState(segments = listOf(CaptureSegment("a", "/a.mp4", 1.0), CaptureSegment("b", "/b.mp4", 1.0)))
        val step = run(start, CaptureEvent.DropLastSegment)
        step.has(CaptureEffect.DeleteFile("/b.mp4"))
        assertThat(step.state.segments).hasSize(1)
    }

    @Test
    fun `validate delivers without merging a single segment and with merging two`() {
        val one = listOf(CaptureSegment("a", "/a.mp4", 1.0))
        assertThat(run(CaptureSessionState(segments = one), CaptureEvent.Validate).effects)
            .contains(CaptureEffect.Deliver(one, merge = false))
        val two = one + CaptureSegment("b", "/b.mp4", 1.0)
        val step = run(CaptureSessionState(segments = two), CaptureEvent.Validate)
        step.has(CaptureEffect.Deliver(two, merge = true))
        assertThat(step.state.segments).isEmpty()
        assertThat(run(events = arrayOf(CaptureEvent.Validate)).effects).isEmpty()
    }

    @Test
    fun `closing an empty viewfinder disarms at once, with segments it asks first`() {
        assertThat(run(events = arrayOf(CaptureEvent.CloseTapped(0))).effects).contains(CaptureEffect.Disarm)
        val start = CaptureSessionState(segments = listOf(CaptureSegment("a", "/a.mp4", 1.0)))
        val asked = run(start, CaptureEvent.CloseTapped(0))
        assertThat(asked.effects).doesNotContain(CaptureEffect.Disarm)
        assertThat(asked.state.discard.isPresented).isTrue()
    }

    @Test
    fun `confirming the discard deletes every file and disarms, keeping hides the question`() {
        val start = CaptureSessionState(segments = listOf(CaptureSegment("a", "/a.mp4", 1.0)))
        val confirmed = run(start, CaptureEvent.CloseTapped(0), CaptureEvent.DiscardAnswered(true, 10))
        confirmed.has(CaptureEffect.DeleteFile("/a.mp4"))
        confirmed.has(CaptureEffect.Disarm)
        val kept = run(start, CaptureEvent.CloseTapped(0), CaptureEvent.DiscardAnswered(false, 10))
        assertThat(kept.effects).doesNotContain(CaptureEffect.Disarm)
        assertThat(kept.state.segments).hasSize(1)
        assertThat(kept.state.discard.isPresented).isFalse()
    }

    @Test
    fun `the tap that closes the alert does not touch the viewfinder`() {
        val start = CaptureSessionState(armedAtMs = 0, segments = listOf(CaptureSegment("a", "/a.mp4", 1.0)))
        val step = run(start, CaptureEvent.CloseTapped(0), CaptureEvent.DiscardAnswered(false, 1_000), CaptureEvent.SceneTapped(CapturePoint(0.5f, 0.5f), 1_100))
        assertThat(step.effects.filterIsInstance<CaptureEffect.FocusAt>()).isEmpty()
    }

    @Test
    fun `a scene tap aims with the clamped point`() {
        val step = run(events = arrayOf(CaptureEvent.SceneTapped(CapturePoint(1.4f, -0.2f), 1_000)))
        step.has(CaptureEffect.FocusAt(CapturePoint(1f, 0f)))
    }

    @Test
    fun `flash cycles and shows its slider except when off`() {
        val on = run(events = arrayOf(CaptureEvent.FlashTapped))
        assertThat(on.state.flash).isEqualTo(CaptureFlashMode.ON)
        assertThat(on.state.flashSlider.visible).isTrue()
        val off = run(on.state, CaptureEvent.FlashTapped, CaptureEvent.FlashTapped)
        assertThat(off.state.flash).isEqualTo(CaptureFlashMode.OFF)
        assertThat(off.state.flashSlider.visible).isFalse()
    }

    @Test
    fun `intensity is clamped into the range`() {
        assertThat(run(events = arrayOf(CaptureEvent.FlashIntensityChanged(0.0))).state.flashIntensity).isEqualTo(0.3)
    }

    @Test
    fun `flip veils during the switch, swaps the lens after and resets zoom`() {
        val mid = run(events = arrayOf(CaptureEvent.ZoomChanged(2f), CaptureEvent.FlipTapped))
        assertThat(mid.state.switching).isTrue()
        mid.has(CaptureEffect.SwitchLens(CaptureLensFacing.FRONT))
        val done = run(mid.state, CaptureEvent.FlipFinished)
        assertThat(done.state.facing).isEqualTo(CaptureLensFacing.FRONT)
        assertThat(done.state.switching).isFalse()
        assertThat(done.state.zoom).isEqualTo(1f)
    }

    @Test
    fun `a second flip during a switch and any flip while filming are ignored`() {
        val during = run(events = arrayOf(CaptureEvent.FlipTapped, CaptureEvent.FlipTapped))
        assertThat(during.effects.filterIsInstance<CaptureEffect.SwitchLens>()).hasSize(1)
        val filming = run(CaptureSessionState(stage = CaptureStage.RECORDING), CaptureEvent.FlipTapped)
        assertThat(filming.effects).isEmpty()
    }

    @Test
    fun `a cancelled take is neither delivered nor lost and raises no warning`() {
        val step = run(events = arrayOf(CaptureEvent.HoldBegan, CaptureEvent.HoldReleased, CaptureEvent.RecordingCancelled("video-1")))
        assertThat(step.state.ledger.pending).isEmpty()
        assertThat(step.state.ledger.hasLostTake).isFalse()
        assertThat(step.effects.filterIsInstance<CaptureEffect.Haptic>()).isEmpty()
    }

    @Test
    fun `a delivered photo settles its token and a failed one is reported lost`() {
        val taken = run(events = arrayOf(CaptureEvent.ShutterTapped(1_000)))
        val token = taken.state.ledger.pending.single()
        assertThat(run(taken.state, CaptureEvent.PhotoDelivered(token)).state.ledger.delivered).containsExactly(token)
        val failed = run(taken.state, CaptureEvent.PhotoFailed(token))
        assertThat(failed.state.ledger.hasLostTake).isTrue()
        assertThat(failed.effects).contains(CaptureEffect.Haptic(CaptureHaptic.WARNING))
    }

    @Test
    fun `a conversation that forbids photos or videos gets neither gesture`() {
        val noPhoto = run(CaptureSessionState(allowsPhoto = false), CaptureEvent.ShutterTapped(1_000))
        assertThat(noPhoto.effects.filterIsInstance<CaptureEffect.TakePhoto>()).isEmpty()
        val noVideo = run(CaptureSessionState(allowsVideo = false), CaptureEvent.HoldBegan)
        assertThat(noVideo.effects.filterIsInstance<CaptureEffect.StartRecording>()).isEmpty()
        assertThat(noVideo.state.holding).isFalse()
    }
}

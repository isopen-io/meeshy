package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.playback.MediaSessionEvent
import me.meeshy.sdk.model.playback.RecordingSource
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallHandoffTest {

    private class Rig(scope: TestScope) {
        val gate = CallActivityGate()
        val system = FakeFocusSystem()
        val playback = PlaybackCoordinator()
        val interruption = PlaybackInterruptionState()
        val recorders = RecorderCallGuard()
        val focus = AudioFocusCoordinator(
            system, FakeNoisySource(), interruption, { gate.isActive },
            StandardTestDispatcher(scope.testScheduler),
        )
        val handoff = CallHandoff(playback, focus, interruption, recorders, gate)
    }

    @Test
    fun `un appel met en pause les lecteurs capables de reprendre et arrete les autres`() = runTest {
        val rig = Rig(this)
        val resumable = FakePlayer(respondsToSessionInterruptions = true, playing = true).also(rig.playback::register)
        val plain = FakePlayer(playing = true).also(rig.playback::register)

        rig.handoff.onCallStarted()

        assertThat(resumable.events).containsExactly(MediaSessionEvent.InterruptionBegan)
        assertThat(resumable.stops).isEqualTo(0)
        assertThat(plain.stops).isEqualTo(1)
        assertThat(rig.gate.isActive).isTrue()
        assertThat(rig.interruption.current.value.cause).isEqualTo(InterruptionCause.Call)
    }

    @Test
    fun `au raccrochage les lecteurs interrompus sont invites a reprendre`() = runTest {
        val rig = Rig(this)
        val resumable = FakePlayer(respondsToSessionInterruptions = true, playing = true).also(rig.playback::register)
        rig.handoff.onCallStarted()

        rig.handoff.onCallEnded()

        assertThat(resumable.events).containsExactly(
            MediaSessionEvent.InterruptionBegan,
            MediaSessionEvent.CallEndedShouldResume,
        ).inOrder()
        assertThat(rig.gate.isActive).isFalse()
        assertThat(rig.interruption.current.value.isInterrupted).isFalse()
    }

    @Test
    fun `l'enregistreur s'arrete et la prise est rendue`() = runTest {
        val rig = Rig(this)
        val controller = RecordingSessionController(rig.system, rig.focus, rig.playback, rig.recorders) { rig.gate.isActive }
        controller.begin(RecordingSource.VoiceMessage)

        rig.handoff.onCallStarted()

        assertThat(controller.isRecording).isFalse()
        assertThat(rig.system.abandoned).contains(FocusKind.Recording)
    }

    @Test
    fun `raccrocher sans avoir decroche ne fait rien`() = runTest {
        val rig = Rig(this)
        val resumable = FakePlayer(respondsToSessionInterruptions = true).also(rig.playback::register)

        rig.handoff.onCallEnded()

        assertThat(resumable.events).isEmpty()
    }

    @Test
    fun `la glue reprend seulement ce qui jouait`() {
        var playing = true
        var resumed = 0
        val adapter = InterruptionResumeAdapter(isPlaying = { playing }, pause = { playing = false }, resume = { resumed += 1 })

        adapter.onSessionEvent(MediaSessionEvent.InterruptionBegan)
        adapter.onSessionEvent(MediaSessionEvent.CallEndedShouldResume)
        assertThat(resumed).isEqualTo(1)

        playing = true
        adapter.onSessionEvent(MediaSessionEvent.InterruptionBegan)
        adapter.onUserPaused()
        adapter.onSessionEvent(MediaSessionEvent.CallEndedShouldResume)
        assertThat(resumed).isEqualTo(1)
    }
}

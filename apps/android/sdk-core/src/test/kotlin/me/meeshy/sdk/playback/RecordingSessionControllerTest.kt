package me.meeshy.sdk.playback

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.playback.RecordingSource
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RecordingSessionControllerTest {

    private class Rig(scope: TestScope, var callActive: Boolean = false) {
        val system = FakeFocusSystem()
        val playback = PlaybackCoordinator()
        val recorders = RecorderCallGuard()
        val focus = AudioFocusCoordinator(
            system, FakeNoisySource(), PlaybackInterruptionState(), { callActive },
            StandardTestDispatcher(scope.testScheduler),
        )
        val keep = mutableListOf<Any>()
        val controller = RecordingSessionController(system, focus, playback, recorders) { callActive }
    }

    @Test
    fun `begin baisse les lecteurs a 0,3 et finish rend exactement les volumes`() = runTest {
        val rig = Rig(this)
        val volume = FakeVolume(0.8f)
        FakePlayer(playing = true, volumeTarget = volume).also(rig.playback::register).also { rig.keep += it }

        assertThat(rig.controller.begin(RecordingSource.VoiceMessage)).isTrue()
        assertThat(volume.volume).isWithin(1e-6f).of(0.8f * 0.3f)
        assertThat(rig.system.requests).containsExactly(FocusKind.Recording)

        rig.controller.finish()
        assertThat(volume.volume).isEqualTo(0.8f)
        assertThat(rig.system.abandoned).containsExactly(FocusKind.Recording)
    }

    @Test
    fun `begin refuse quand un appel tient la session`() = runTest {
        val rig = Rig(this, callActive = true)

        assertThat(rig.controller.begin(RecordingSource.VoiceMessage)).isFalse()
        assertThat(rig.system.requests).isEmpty()
        assertThat(rig.controller.isRecording).isFalse()
    }

    @Test
    fun `begin refuse quand le systeme refuse le focus`() = runTest {
        val rig = Rig(this)
        rig.system.grants = false

        assertThat(rig.controller.begin(RecordingSource.Video)).isFalse()
        assertThat(rig.controller.isRecording).isFalse()
    }

    @Test
    fun `finish sans begin n'ecrit aucun volume`() = runTest {
        val rig = Rig(this)

        rig.controller.finish()

        assertThat(rig.system.abandoned).isEmpty()
    }

    @Test
    fun `un volume change pendant la prise n'est pas ecrase`() = runTest {
        val rig = Rig(this)
        val volume = FakeVolume(1f)
        FakePlayer(playing = true, volumeTarget = volume).also(rig.playback::register).also { rig.keep += it }
        rig.controller.begin(RecordingSource.VoiceMessage)

        volume.volume = 0.9f
        rig.controller.finish()

        assertThat(volume.volume).isEqualTo(0.9f)
    }
}

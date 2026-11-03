package me.meeshy.sdk.recording

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.audio.VoiceRecorderEngine
import me.meeshy.sdk.audio.VoiceRecorderThreads
import me.meeshy.sdk.model.waveform.AudioRecordingSettings
import me.meeshy.sdk.playback.AudioFocusCoordinator
import me.meeshy.sdk.playback.FakeFocusSystem
import me.meeshy.sdk.playback.FakeNoisySource
import me.meeshy.sdk.playback.FakePlayer
import me.meeshy.sdk.playback.FakeVolume
import me.meeshy.sdk.playback.PlaybackCoordinator
import me.meeshy.sdk.playback.PlaybackInterruptionState
import me.meeshy.sdk.playback.RecorderCallGuard
import me.meeshy.sdk.playback.RecordingSessionController
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RecorderCallGuardTest {

    private class Engine : VoiceRecorderEngine {
        var released = 0
        override fun start(output: File) = output.writeBytes(byteArrayOf(1, 2, 3))
        override fun stop() = Unit
        override fun release() {
            released += 1
        }

        override fun amplitude(): Int = 2_000
    }

    @Test
    fun `au debut d'un appel l'enregistrement s'arrete et la prise est gardee`() = runTest {
        val system = FakeFocusSystem()
        val playback = PlaybackCoordinator()
        val guard = RecorderCallGuard()
        val focus = AudioFocusCoordinator(
            system, FakeNoisySource(), PlaybackInterruptionState(), { false },
            StandardTestDispatcher(testScheduler),
        )
        val session = RecordingSessionController(system, focus, playback, guard) { false }
        val volume = FakeVolume(0.8f)
        val player = FakePlayer(playing = true, volumeTarget = volume).also(playback::register)
        val engine = Engine()
        val recorder = DefaultAudioRecorder(
            AudioRecordingSettings.standard, Files.createTempDirectory("rec").toFile(), { engine },
            session, guard, { 1L }, VoiceRecorderThreads.Inline,
        )
        var kept: AudioRecordingResult? = null
        recorder.onInterrupted = { kept = it }
        recorder.start()
        repeat(15) { recorder.tick(0.1) }

        guard.stopAllForCall()

        assertThat(recorder.session.isRecording).isFalse()
        assertThat(kept).isNotNull()
        assertThat(kept!!.file.exists()).isTrue()
        assertThat(kept!!.durationSeconds).isWithin(0.05).of(1.5)
        assertThat(engine.released).isEqualTo(1)
        assertThat(volume.volume).isEqualTo(0.8f)
        assertThat(player).isNotNull()
    }
}

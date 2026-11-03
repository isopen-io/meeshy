package me.meeshy.sdk.recording

import com.google.common.truth.Truth.assertThat
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
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
class DefaultAudioRecorderTest {

    private class FakeEngine(var failOnStop: Boolean = false, var failOnStart: Boolean = false) : VoiceRecorderEngine {
        var output: File? = null
        var started = 0
        var stopped = 0
        var released = 0
        override fun start(output: File) {
            if (failOnStart) throw IllegalStateException("micro occupé")
            started += 1
            this.output = output
            output.writeBytes(byteArrayOf(1, 2, 3))
        }

        override fun stop() {
            stopped += 1
            if (failOnStop) throw IllegalStateException("stop")
        }

        override fun release() {
            released += 1
        }

        override fun amplitude(): Int = 4_000
    }

    private class Rig(
        scope: TestScope,
        settings: AudioRecordingSettings = AudioRecordingSettings.standard,
        var callActive: Boolean = false,
        val engine: FakeEngine = FakeEngine(),
    ) {
        val seen = mutableListOf<AudioRecordingSettings>()
        val system = FakeFocusSystem()
        val playback = PlaybackCoordinator()
        val guard = RecorderCallGuard()
        val focus = AudioFocusCoordinator(
            system, FakeNoisySource(), PlaybackInterruptionState(), { callActive },
            StandardTestDispatcher(scope.testScheduler),
        )
        val session = RecordingSessionController(system, focus, playback, guard) { callActive }
        val keep = mutableListOf<Any>()
        val recorder = DefaultAudioRecorder(
            settings = settings,
            directory = Files.createTempDirectory("rec").toFile(),
            engineFactory = { seen += it; engine },
            recordingSession = session,
            callGuard = guard,
            clockMillis = { 1_700_000_000_000L },
            threads = VoiceRecorderThreads.Inline,
        )

        fun record(seconds: Double): Boolean {
            var live = false
            recorder.start { live = it }
            repeat((seconds / 0.1).toInt()) { recorder.tick(0.1) }
            return live
        }
    }

    private fun Rig.finished(): AudioRecordingResult? {
        var result: AudioRecordingResult? = null
        recorder.finish { result = it }
        return result
    }

    @Test
    fun `le moteur est configure avec les reglages du preset`() = runTest {
        val rig = Rig(this, AudioRecordingSettings.voiceSample)

        rig.record(0.2)

        assertThat(rig.seen).containsExactly(AudioRecordingSettings.voiceSample)
    }

    @Test
    fun `une prise de 1 s rend fichier, duree, niveaux et type MIME`() = runTest {
        val rig = Rig(this)
        rig.record(1.0)

        val result = rig.finished()!!

        assertThat(result.durationSeconds).isWithin(0.05).of(1.0)
        assertThat(result.mimeType).isEqualTo("audio/mp4")
        assertThat(result.levels).isNotEmpty()
        assertThat(result.levels.all { it in 0f..1f && it > 0f }).isTrue()
        assertThat(result.file.exists()).isTrue()
    }

    @Test
    fun `une prise sous 0,5 s est ecartee et son fichier supprime`() = runTest {
        val rig = Rig(this)
        rig.record(0.3)
        val file = rig.engine.output!!
        assertThat(file.exists()).isTrue()

        assertThat(rig.finished()).isNull()
        assertThat(file.exists()).isFalse()
        assertThat(rig.engine.released).isEqualTo(1)
    }

    @Test
    fun `la voix echantillon ecarte neuf secondes et garde dix secondes`() = runTest {
        val short = Rig(this, AudioRecordingSettings.voiceSample)
        short.record(9.0)
        assertThat(short.finished()).isNull()

        val long = Rig(this, AudioRecordingSettings.voiceSample)
        long.record(10.2)
        assertThat(long.finished()).isNotNull()
    }

    @Test
    fun `aucun plafond de duree`() = runTest {
        val rig = Rig(this)
        rig.record(900.0)

        assertThat(rig.finished()!!.durationSeconds).isAtLeast(899.0)
    }

    @Test
    fun `un stop qui leve libere quand meme le micro`() = runTest {
        val rig = Rig(this, engine = FakeEngine(failOnStop = true))
        rig.record(1.0)

        rig.finished()

        assertThat(rig.engine.stopped).isEqualTo(1)
        assertThat(rig.engine.released).isEqualTo(1)
    }

    @Test
    fun `un micro qui refuse de s'ouvrir ne laisse ni session ni lecteur baisse`() = runTest {
        val rig = Rig(this, engine = FakeEngine(failOnStart = true))
        val volume = FakeVolume(0.8f)
        FakePlayer(playing = true, volumeTarget = volume).also(rig.playback::register).also { rig.keep += it }

        assertThat(rig.record(0.5)).isFalse()

        assertThat(rig.session.isRecording).isFalse()
        assertThat(volume.volume).isEqualTo(0.8f)
    }

    @Test
    fun `la session baisse les lecteurs puis les remonte exactement a la fin`() = runTest {
        val rig = Rig(this)
        val volume = FakeVolume(0.8f)
        FakePlayer(playing = true, volumeTarget = volume).also(rig.playback::register).also { rig.keep += it }

        rig.record(1.0)
        assertThat(volume.volume).isWithin(1e-6f).of(0.8f * 0.3f)

        rig.finished()
        assertThat(volume.volume).isEqualTo(0.8f)
    }

    @Test
    fun `annuler rend aussi les lecteurs`() = runTest {
        val rig = Rig(this)
        val volume = FakeVolume(1f)
        FakePlayer(playing = true, volumeTarget = volume).also(rig.playback::register).also { rig.keep += it }
        rig.record(1.0)

        rig.recorder.cancel()

        assertThat(volume.volume).isEqualTo(1f)
        assertThat(rig.recorder.session.isRecording).isFalse()
    }

    @Test
    fun `sous un appel l'enregistrement ne demarre pas`() = runTest {
        val rig = Rig(this, callActive = true)

        assertThat(rig.record(0.5)).isFalse()
        assertThat(rig.engine.started).isEqualTo(0)
    }
}

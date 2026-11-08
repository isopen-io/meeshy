package me.meeshy.ui.component.recording

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import java.io.File
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.sdk.recording.AudioRecordingResult
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Un enregistreur sans micro : il rejoue les transitions de la prise et compte ses appels. */
internal class FakeRecorder(
    private val opensMicrophone: Boolean = true,
    private val takeSeconds: Double = 3.0,
) : AudioRecordingProviding {
    override var session: VoiceRecordingSession = VoiceRecordingSession.idle()
        private set
    override var onInterrupted: ((AudioRecordingResult?) -> Unit)? = null
    var starts = 0
    var cancels = 0
    var abandons = 0

    override fun start(onStarted: (Boolean) -> Unit) {
        starts++
        if (opensMicrophone) session = session.start()
        onStarted(opensMicrophone)
    }

    override fun tick(deltaSeconds: Double) {
        session = session.tick(deltaSeconds)
    }

    override fun finish(onResult: (AudioRecordingResult?) -> Unit) {
        session = VoiceRecordingSession.idle()
        onResult(AudioRecordingResult(File.createTempFile("take", ".m4a"), takeSeconds, listOf(0.2f, 0.8f), "audio/mp4"))
    }

    override fun cancel() {
        cancels++
        session = VoiceRecordingSession.idle()
    }

    override fun abandon(onResult: (AudioRecordingResult?) -> Unit) {
        abandons++
        session = VoiceRecordingSession.idle()
        onResult(null)
    }
}

/** Un moteur audio sans lecteur : il note les ordres reçus et laisse le test poser l'état. */
internal class FakePlaybackEngine : AudioPlaybackEngine {
    private val mutableState = MutableStateFlow(AudioPlaybackState())
    override val state: StateFlow<AudioPlaybackState> = mutableState
    override val events: SharedFlow<AudioEngineEvent> = MutableSharedFlow()
    val localPlays = mutableListOf<Pair<String, String>>()
    var toggles = 0
    var stops = 0

    fun emit(next: AudioPlaybackState) {
        mutableState.value = next
    }

    override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean = true

    override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin): Boolean {
        localPlays += attachmentId to fileUri
        mutableState.value = AudioPlaybackState(attachmentId = attachmentId, isPlaying = true, durationMs = 3_000)
        return true
    }

    override fun togglePlayPause(origin: PlaybackCommandOrigin) {
        toggles++
        mutableState.value = mutableState.value.copy(isPlaying = !mutableState.value.isPlaying)
    }

    override fun pause() = Unit
    override fun resumeFromInterruption() = Unit
    override fun stop() {
        stops++
        mutableState.value = AudioPlaybackState()
    }

    override fun seek(fraction: Double) = Unit
    override fun seekToMs(positionMs: Long) = Unit
    override fun skip(seconds: Double) = Unit
    override fun setSpeed(speed: PlaybackSpeed) = Unit
    override fun cycleSpeed() = Unit
    override fun setLoop(loop: Boolean) = Unit
    override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
    override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit
}

/** Les animations infinies empêchent l'inactivité des tests Compose : on les coupe par « Réduire les animations ». */
@Composable
internal fun StillMotion(content: @Composable () -> Unit) =
    CompositionLocalProvider(LocalReduceMotion provides true, content = content)

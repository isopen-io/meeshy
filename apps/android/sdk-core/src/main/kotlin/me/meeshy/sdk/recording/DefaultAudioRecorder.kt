package me.meeshy.sdk.recording

import java.io.File
import me.meeshy.sdk.audio.ComposerVoiceCapture
import me.meeshy.sdk.audio.VoiceRecorderEngine
import me.meeshy.sdk.audio.VoiceRecorderThreads
import me.meeshy.sdk.audio.VoiceTake
import me.meeshy.sdk.model.playback.RecordingSource
import me.meeshy.sdk.model.waveform.AudioRecordingSettings
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.playback.CallInterruptibleRecorder
import me.meeshy.sdk.playback.RecorderCallGuard
import me.meeshy.sdk.playback.RecordingSessionController

/**
 * L'enregistreur par défaut (iOS `DefaultSDKAudioRecorder`) : une prise [ComposerVoiceCapture] réglée par
 * [settings], enveloppée de la session d'enregistrement (focus exclusif, lecteurs baissés puis rendus
 * EXACTEMENT) et inscrite au [RecorderCallGuard] : au début d'un appel la prise s'arrête et reste gardée.
 * La libération est sûre : stop sous try/catch, puis release, toujours.
 */
public class DefaultAudioRecorder(
    private val settings: AudioRecordingSettings,
    directory: File,
    engineFactory: (AudioRecordingSettings) -> VoiceRecorderEngine,
    private val recordingSession: RecordingSessionController? = null,
    private val callGuard: RecorderCallGuard? = null,
    clockMillis: () -> Long = System::currentTimeMillis,
    threads: VoiceRecorderThreads = VoiceRecorderThreads.dedicated(),
) : AudioRecordingProviding, CallInterruptibleRecorder {

    private val capture = ComposerVoiceCapture(directory, { engineFactory(settings) }, clockMillis, threads, settings)

    override val session: VoiceRecordingSession get() = capture.session

    override var onInterrupted: ((AudioRecordingResult?) -> Unit)? = null

    override fun start(onStarted: (Boolean) -> Unit) {
        if (capture.session.isRecording) return onStarted(false)
        if (recordingSession?.begin(RecordingSource.VoiceMessage) == false) return onStarted(false)
        callGuard?.register(this)
        capture.start { live ->
            if (!live) endSession()
            onStarted(live)
        }
    }

    override fun tick(deltaSeconds: Double) = capture.tick(deltaSeconds)

    override fun finish(onResult: (AudioRecordingResult?) -> Unit) {
        capture.finish { onResult(it?.toResult()) }
        endSession()
    }

    override fun cancel() {
        capture.cancel()
        endSession()
    }

    override fun abandon(onResult: (AudioRecordingResult?) -> Unit) {
        capture.abandon { onResult(it?.toResult()) }
        endSession()
    }

    /** Un appel décroche : la prise s'arrête, est gardée, et remise à [onInterrupted]. */
    override fun stopForCall() {
        if (!capture.session.isRecording) return
        finish { onInterrupted?.invoke(it) }
    }

    private fun endSession() {
        recordingSession?.finish()
        callGuard?.unregister(this)
    }

    private fun VoiceTake.toResult() = AudioRecordingResult(file, durationSeconds, levels, settings.mimeType)
}

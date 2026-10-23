package me.meeshy.app.chat

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import java.io.File
import me.meeshy.sdk.model.waveform.MicAmplitudeDecibels
import me.meeshy.sdk.model.waveform.VoiceRecordingFile
import me.meeshy.sdk.model.waveform.VoiceRecordingOutcome
import me.meeshy.sdk.model.waveform.VoiceRecordingSession

/** The microphone behind a voice take — `MediaRecorder` on device, a fake in tests. */
internal interface VoiceRecorderEngine {
    fun start(output: File)
    fun stop()
    fun release()
    fun amplitude(): Int?
}

/** A finished take: its file and how long it lasts. */
internal data class VoiceTake(val file: File, val durationSeconds: Double)

/**
 * One voice take of the composer: the hardware recorder AND the pure pill state
 * ([VoiceRecordingSession]) move together, so the mic can never stay open once the pill
 * is gone. [abandon] is what leaving the screen calls (navigation, rotation, background):
 * the mic is freed and a long enough take is handed over to join the tray, as iOS does
 * when the screen changes (`stopRecordingToAttachment`); a too short one is deleted.
 */
internal class ComposerVoiceCapture(
    private val directory: File,
    private val engineFactory: () -> VoiceRecorderEngine,
    private val clockMillis: () -> Long = System::currentTimeMillis,
) {
    var session: VoiceRecordingSession = VoiceRecordingSession.idle()
        private set

    private var engine: VoiceRecorderEngine? = null
    private var output: File? = null

    /** Opens the mic; `false` (and nothing left behind) when it refuses. */
    fun start(): Boolean {
        if (session.isRecording) return false
        directory.mkdirs()
        val target = File(directory, VoiceRecordingFile.next(clockMillis()))
        val recorder = engineFactory()
        return try {
            recorder.start(target)
            engine = recorder
            output = target
            session = session.start()
            true
        } catch (_: Exception) {
            runCatching { recorder.release() }
            target.delete()
            false
        }
    }

    /** Advances the pill clock and meters the mic level. */
    fun tick(deltaSeconds: Double) {
        if (!session.isRecording) return
        session = session.tick(deltaSeconds)
        val amplitude = engine?.let { runCatching { it.amplitude() }.getOrNull() } ?: return
        session = session.meter(MicAmplitudeDecibels.toDecibels(amplitude))
    }

    /** Stops the take: its file when it is long enough to send, else `null` (file deleted). */
    fun finish(): VoiceTake? {
        val file = releaseEngine()
        val stop = session.stop()
        session = stop.session
        val outcome = stop.outcome
        if (outcome is VoiceRecordingOutcome.Completed && file != null && file.length() > 0) {
            return VoiceTake(file, outcome.durationSeconds)
        }
        file?.delete()
        return null
    }

    /** Leaving the screen: frees the mic and keeps a sendable take, without touching an idle capture. */
    fun abandon(): VoiceTake? = if (session.isRecording || engine != null) finish() else null

    /** Discards the take and its file. */
    fun cancel() {
        releaseEngine()?.delete()
        session = session.cancel()
    }

    private fun releaseEngine(): File? {
        engine?.let { recorder ->
            runCatching { recorder.stop() }
            runCatching { recorder.release() }
        }
        engine = null
        val file = output
        output = null
        return file
    }
}

/** [VoiceRecorderEngine] over the platform `MediaRecorder` (AAC in MPEG-4, like iOS m4a). */
internal class MediaRecorderEngine(private val context: Context) : VoiceRecorderEngine {
    private var recorder: MediaRecorder? = null

    override fun start(output: File) {
        val created = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        recorder = created
        created.setAudioSource(MediaRecorder.AudioSource.MIC)
        created.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        created.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        created.setOutputFile(output.absolutePath)
        created.prepare()
        created.start()
    }

    override fun stop() {
        recorder?.stop()
    }

    override fun release() {
        recorder?.release()
        recorder = null
    }

    override fun amplitude(): Int? = recorder?.maxAmplitude
}

package me.meeshy.sdk.audio

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.io.File
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import me.meeshy.sdk.model.waveform.AudioLevelNormalizer
import me.meeshy.sdk.model.waveform.AudioRecordingSettings
import me.meeshy.sdk.model.waveform.MicAmplitudeDecibels
import me.meeshy.sdk.model.waveform.RecordingTakePolicy
import me.meeshy.sdk.model.waveform.VoiceEncodingProfile
import me.meeshy.sdk.model.waveform.VoiceRecordingFile
import me.meeshy.sdk.model.waveform.VoiceRecordingOutcome
import me.meeshy.sdk.model.waveform.VoiceRecordingSession

/** The microphone behind a voice take — `MediaRecorder` on device, a fake in tests. */
public interface VoiceRecorderEngine {
    fun start(output: File)
    fun stop()
    fun release()
    fun amplitude(): Int?
}

/** A finished take: its file and how long it lasts. */
public data class VoiceTake(
    val file: File,
    val durationSeconds: Double,
    /** Les niveaux de TOUTE la prise (0..1, une valeur par battement), réutilisés pour l'onde persistée du message. */
    val levels: List<Float> = emptyList(),
)

/**
 * Where a take's microphone work runs and where its results come back. `MediaRecorder.prepare()`,
 * `start()` and `stop()` block for tens of milliseconds (the codec opens, the container is closed):
 * on the main thread they cost frames at the press and at the release of the mic.
 */
public class VoiceRecorderThreads(
    internal val recorder: Executor,
    internal val result: Executor,
) {
    public companion object {
        /** Everything runs on the caller's thread: what a JVM test wants. */
        public val Inline: VoiceRecorderThreads = VoiceRecorderThreads(Executor { it.run() }, Executor { it.run() })

        private val recorderThread: Executor by lazy {
            Executors.newSingleThreadExecutor { task -> Thread(task, "meeshy-voice-recorder").apply { isDaemon = true } }
        }

        private val mainThread: Executor by lazy {
            val handler = Handler(Looper.getMainLooper())
            Executor { handler.post(it) }
        }

        /**
         * ONE dedicated thread, shared by every capture (two takes never record at once, and their
         * calls stay in the order they were made); results come back on the main thread.
         */
        public fun dedicated(): VoiceRecorderThreads = VoiceRecorderThreads(recorderThread, mainThread)
    }
}

/**
 * One voice take of the composer: the hardware recorder AND the pure pill state
 * ([VoiceRecordingSession]) move together, so the mic can never stay open once the pill
 * is gone. The pill state is the source of truth and only ever changes on the calling (main) thread:
 * the pill is live the instant the mic is pressed and gone the instant it is released, while the
 * recorder opens and closes on [VoiceRecorderThreads.recorder], in the order the calls were made.
 * [abandon] is what leaving the screen calls (navigation, rotation, background):
 * the mic is freed and a long enough take is handed over to join the tray, as iOS does
 * when the screen changes (`stopRecordingToAttachment`); a too short one is deleted.
 */
public class ComposerVoiceCapture(
    private val directory: File,
    private val engineFactory: () -> VoiceRecorderEngine,
    private val clockMillis: () -> Long = System::currentTimeMillis,
    private val threads: VoiceRecorderThreads = VoiceRecorderThreads.dedicated(),
    private val settings: AudioRecordingSettings = AudioRecordingSettings.standard,
) {
    var session: VoiceRecordingSession = VoiceRecordingSession.idle()
        private set

    private var take: Take? = null

    /** One take's file and, once the mic is open, its recorder: published by the recorder thread, read by [tick] for the level. */
    private class Take(val file: File) {
        val levels: MutableList<Float> = ArrayList()

        @Volatile
        var engine: VoiceRecorderEngine? = null
    }

    /**
     * Opens the mic. The pill is live at once; [onStarted] then tells, on the main thread, whether the mic
     * really opened and the take is still running (`false`: it refused, and nothing is left behind, or the
     * take was already released or cancelled).
     */
    fun start(onStarted: (Boolean) -> Unit = {}) {
        if (session.isRecording) return onStarted(false)
        val opening = Take(File(directory, VoiceRecordingFile.next(clockMillis(), settings.fileExtension)))
        take = opening
        session = session.start()
        threads.recorder.execute {
            val opened = open(opening)
            threads.result.execute { onOpened(opening, opened, onStarted) }
        }
    }

    /** Advances the pill clock and meters the mic level. */
    fun tick(deltaSeconds: Double) {
        if (!session.isRecording) return
        session = session.tick(deltaSeconds)
        val amplitude = take?.engine?.let { runCatching { it.amplitude() }.getOrNull() } ?: return
        val decibels = MicAmplitudeDecibels.toDecibels(amplitude)
        session = session.meter(decibels)
        take?.levels?.add(AudioLevelNormalizer.normalize(decibels))
    }

    /**
     * Stops the take: [onTake] receives, on the main thread once the recorder has closed the file, the take
     * when it is long enough to send, else `null` (file deleted). The pill is idle as soon as this returns.
     */
    fun finish(onTake: (VoiceTake?) -> Unit = {}) {
        val closing = take
        take = null
        val stop = session.stop()
        session = stop.session
        val outcome = stop.outcome
        val levels = closing?.levels?.toList().orEmpty()
        if (closing == null) return onTake(null)
        threads.recorder.execute {
            close(closing)
            val sendable = (outcome as? VoiceRecordingOutcome.Completed)
                ?.takeIf { RecordingTakePolicy.keeps(it.durationSeconds, settings) && closing.file.length() > 0 }
                ?.let { VoiceTake(closing.file, it.durationSeconds, levels) }
            if (sendable == null) closing.file.delete()
            threads.result.execute { onTake(sendable) }
        }
    }

    /** Leaving the screen: frees the mic and keeps a sendable take, without touching an idle capture. */
    fun abandon(onTake: (VoiceTake?) -> Unit = {}) {
        if (session.isRecording || take != null) finish(onTake) else onTake(null)
    }

    /** Discards the take and its file. */
    fun cancel() {
        val closing = take
        take = null
        session = session.cancel()
        closing ?: return
        threads.recorder.execute {
            close(closing)
            closing.file.delete()
        }
    }

    private fun open(opening: Take): Boolean {
        var recorder: VoiceRecorderEngine? = null
        return try {
            directory.mkdirs()
            recorder = engineFactory()
            recorder.start(opening.file)
            opening.engine = recorder
            true
        } catch (_: Exception) {
            recorder?.let { runCatching { it.release() } }
            opening.file.delete()
            false
        }
    }

    private fun onOpened(opened: Take, ok: Boolean, onStarted: (Boolean) -> Unit) {
        val running = take === opened
        if (!ok && running) {
            take = null
            session = session.cancel()
        }
        onStarted(ok && running)
    }

    private fun close(closing: Take) {
        closing.engine?.let { recorder ->
            runCatching { recorder.stop() }
            runCatching { recorder.release() }
        }
        closing.engine = null
    }
}

/**
 * [VoiceRecorderEngine] over the platform `MediaRecorder`, encoded as [profile] says (AAC in MPEG-4,
 * like iOS m4a). The platform defaults (8 000 Hz, mono, 12 200 b/s on AOSP) are never left to apply.
 */
public class MediaRecorderEngine internal constructor(
    private val profile: VoiceEncodingProfile,
    private val newRecorder: () -> MediaRecorder,
) : VoiceRecorderEngine {
    public constructor(context: Context, profile: VoiceEncodingProfile) : this(profile, { platformRecorder(context) })

    @Volatile
    private var recorder: MediaRecorder? = null

    override fun start(output: File) {
        val created = newRecorder()
        recorder = created
        created.setAudioSource(MediaRecorder.AudioSource.MIC)
        created.setOutputFormat(profile.container.outputFormat())
        created.setAudioEncoder(profile.codec.encoder())
        created.setAudioSamplingRate(profile.sampleRateHz)
        created.setAudioChannels(profile.channelCount)
        created.setAudioEncodingBitRate(profile.bitRateBitsPerSecond)
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

    private companion object {
        fun platformRecorder(context: Context): MediaRecorder =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
    }

    private fun VoiceEncodingProfile.Container.outputFormat(): Int = when (this) {
        VoiceEncodingProfile.Container.MPEG_4 -> MediaRecorder.OutputFormat.MPEG_4
        VoiceEncodingProfile.Container.OGG -> MediaRecorder.OutputFormat.OGG
    }

    private fun VoiceEncodingProfile.Codec.encoder(): Int = when (this) {
        VoiceEncodingProfile.Codec.AAC_LC -> MediaRecorder.AudioEncoder.AAC
        VoiceEncodingProfile.Codec.OPUS -> MediaRecorder.AudioEncoder.OPUS
    }
}

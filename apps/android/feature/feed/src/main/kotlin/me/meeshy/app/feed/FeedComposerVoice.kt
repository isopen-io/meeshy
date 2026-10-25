package me.meeshy.app.feed

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.MediaRecorder
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import java.io.File
import kotlinx.coroutines.delay
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.waveform.MicAmplitudeDecibels
import me.meeshy.sdk.model.waveform.VoiceRecordingFile
import me.meeshy.sdk.model.waveform.VoiceRecordingOutcome
import me.meeshy.sdk.model.waveform.VoiceRecordingSession

/**
 * The feed composer's in-app voice take — Android has no system "record audio to a file" intent this
 * composer can rely on, so it mirrors ChatScreen's proven [MediaRecorder] wiring (same `MPEG_4`/`AAC`
 * config, same permission-then-record shape). The pure state machine it drives ([VoiceRecordingSession],
 * [VoiceRecordingFile]) is shared with chat; only this runtime I/O glue lives here.
 */
internal class FeedVoiceRecorder(private val context: Context) {
    var session: VoiceRecordingSession by mutableStateOf(VoiceRecordingSession.idle())
        private set
    private var recorder: MediaRecorder? = null
    private var file: File? = null
    internal var askPermission: () -> Unit = {}

    fun request() {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (granted) start() else askPermission()
    }

    fun start() {
        val dir = File(context.cacheDir, "voice").apply { mkdirs() }
        val take = File(dir, VoiceRecordingFile.next(System.currentTimeMillis()))
        val created = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        try {
            created.setAudioSource(MediaRecorder.AudioSource.MIC)
            created.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            created.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            created.setOutputFile(take.absolutePath)
            created.prepare()
            created.start()
            recorder = created
            file = take
            session = session.start()
        } catch (e: Exception) {
            created.release()
            take.delete()
        }
    }

    fun cancel() {
        release()?.delete()
        session = session.cancel()
    }

    /**
     * Both Stop and Send finalise the take identically — this composer has no staging tray, so "stop
     * and add" reads as "deliver it now". Returns the take to upload, or `null` when it is unusable.
     */
    fun finish(): MediaUploadItem? {
        val take = release()
        val stop = session.stop()
        session = stop.session
        val completed = take.takeIf { stop.outcome is VoiceRecordingOutcome.Completed }
        val bytes = completed?.let { runCatching { it.readBytes() }.getOrNull() }
        take?.delete()
        if (completed == null || bytes == null || bytes.isEmpty()) return null
        return MediaUploadItem(bytes = bytes, fileName = completed.name, mimeType = "audio/mp4")
    }

    /** The 100 ms tick-and-meter loop, alive only while a take is recording. */
    suspend fun meterWhileRecording() {
        while (session.isRecording) {
            delay(TICK_MS)
            session = session.tick(TICK_MS / 1000.0)
            val amplitude = recorder?.let { runCatching { it.maxAmplitude }.getOrNull() }
            if (amplitude != null) session = session.meter(MicAmplitudeDecibels.toDecibels(amplitude))
        }
    }

    /** A dismissed sheet must never leave the microphone or the take file open. */
    fun dispose() {
        recorder?.let { runCatching { it.release() } }
        file?.delete()
    }

    private fun release(): File? {
        recorder?.let { active ->
            runCatching { active.stop() }
            active.release()
        }
        recorder = null
        val take = file
        file = null
        return take
    }

    private companion object {
        const val TICK_MS = 100L
    }
}

@Composable
internal fun rememberFeedVoiceRecorder(): FeedVoiceRecorder {
    val context = LocalContext.current
    val voice = remember { FeedVoiceRecorder(context) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) voice.start() }
    voice.askPermission = { permission.launch(Manifest.permission.RECORD_AUDIO) }
    DisposableEffect(voice) { onDispose { voice.dispose() } }
    LaunchedEffect(voice.session.isRecording) { voice.meterWhileRecording() }
    return voice
}

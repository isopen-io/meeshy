package me.meeshy.app.chat

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.ui.haptics.rememberMeeshyHaptics

private const val VOICE_MIME_TYPE = "audio/mp4"

/** L'enregistrement vocal du composeur vu de la barre : l'état de la prise et ses trois portes. */
internal class ComposerVoiceHandle(
    val isRecording: Boolean,
    val session: me.meeshy.sdk.model.waveform.VoiceRecordingSession,
    val request: () -> Unit,
    val cancel: () -> Unit,
    val finish: () -> Unit,
)

/**
 * Le cycle de vie complet de l'enregistrement (permission micro, prise, métronome, arrêt en
 * arrière-plan), sorti de `ChatComposer` pour que la barre ne soit qu'un assemblage. Une prise
 * terminée rejoint le plateau par copie hors du fil principal (iOS `stopRecordingToAttachment`).
 */
@Composable
internal fun rememberComposerVoice(
    onStageVoiceFile: ((File) -> Unit)?,
    onPickFile: (bytes: ByteArray, fileName: String, mimeType: String?) -> Unit,
): ComposerVoiceHandle {
    val context = LocalContext.current
    val ioScope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val capture = remember { ComposerVoiceCapture(File(context.cacheDir, "voice"), { MediaRecorderEngine(context) }) }
    var recording by remember { mutableStateOf(capture.session) }

    fun deliver(take: VoiceTake?) {
        val file = take?.file ?: return
        val stage = onStageVoiceFile
        if (stage != null) return stage(file)
        ioScope.launch {
            val bytes = withContext(Dispatchers.IO) { runCatching { file.readBytes() }.getOrNull().also { file.delete() } }
            if (bytes != null && bytes.isNotEmpty()) onPickFile(bytes, file.name, VOICE_MIME_TYPE)
        }
    }

    fun start() {
        if (capture.start()) haptics.medium()
        recording = capture.session
    }

    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) start()
    }
    val latestDeliver by rememberUpdatedState(::deliver)
    DisposableEffect(capture) { onDispose { latestDeliver(capture.abandon()) } }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        if (capture.session.isRecording) {
            deliver(capture.abandon())
            recording = capture.session
        }
    }
    LaunchedEffect(recording.isRecording) {
        while (recording.isRecording) {
            delay(100)
            capture.tick(0.1)
            recording = capture.session
        }
    }
    return ComposerVoiceHandle(
        isRecording = recording.isRecording,
        session = recording,
        request = {
            val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            if (granted) start() else permission.launch(Manifest.permission.RECORD_AUDIO)
        },
        cancel = {
            capture.cancel()
            recording = capture.session
            haptics.light()
        },
        finish = {
            val take = capture.finish()
            recording = capture.session
            haptics.light()
            deliver(take)
        },
    )
}

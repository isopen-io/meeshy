package me.meeshy.app.chat

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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import dagger.hilt.android.EntryPointAccessors
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.audio.MediaRecorderEngine
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.ongoing.VoiceRecordingBackgroundLaw
import me.meeshy.sdk.model.waveform.AudioRecordingSettings
import me.meeshy.sdk.recording.AudioRecorderEntryPoint
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.sdk.recording.AudioRecordingResult
import me.meeshy.sdk.recording.DefaultAudioRecorder
import me.meeshy.ui.component.permission.PermissionFlow
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.component.recording.LocalVoiceRecordingHost
import me.meeshy.ui.haptics.rememberMeeshyHaptics

/** L'enregistrement vocal du composeur vu de la barre : l'état de la prise et ses trois portes. */
internal class ComposerVoiceHandle(
    val isRecording: Boolean,
    val session: me.meeshy.sdk.model.waveform.VoiceRecordingSession,
    val request: () -> Unit,
    val cancel: () -> Unit,
    val finish: () -> Unit,
    /** La porte du micro : la feuille d'explication ou la carte « Accès au micro refusé », rendue par `PermissionFlowHost`. */
    val permissions: PermissionFlow,
)

/**
 * Le cycle de vie complet de l'enregistrement (permission micro, prise, métronome, sortie
 * de l'écran : la prise continue si le service de premier plan la tient, sinon elle est posée dans le tiroir), sorti de `ChatComposer` pour que la barre ne soit qu'un assemblage. Une prise
 * terminée rejoint le plateau par copie hors du fil principal (iOS `stopRecordingToAttachment`).
 */
@Composable
internal fun rememberComposerVoice(
    onStageVoiceFile: ((File) -> Unit)?,
    onPickFile: (file: File, fileName: String, mimeType: String?) -> Unit,
    newRecorder: (() -> AudioRecordingProviding)? = null,
    conversationTitle: String = "",
): ComposerVoiceHandle {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val recordingHost = LocalVoiceRecordingHost.current
    val permissions = rememberPermissionFlow()
    val publishedTake = remember { AtomicBoolean(false) }
    val recorder = remember { (newRecorder ?: { sharedRecorder(context) })() }
    var recording by remember { mutableStateOf(recorder.session) }

    fun deliver(result: AudioRecordingResult?) {
        val file = result?.file ?: return
        val stage = onStageVoiceFile
        if (stage != null) return stage(file)
        if (file.length() > 0L) onPickFile(file, file.name, result.mimeType) else file.delete()
    }

    fun start() {
        recorder.start { live ->
            recording = recorder.session
            if (live) {
                haptics.light()
                publishedTake.set(true)
                recordingHost.updateTake(conversationTitle, emptyList())
                recordingHost.publish(System.currentTimeMillis())
            }
        }
        recording = recorder.session
    }

    fun finishTake() {
        recorder.finish(::deliver)
        recording = recorder.session
        haptics.light()
    }

    fun cancelTake() {
        recorder.cancel()
        recording = recorder.session
        haptics.light()
    }

    val latestDeliver by rememberUpdatedState(::deliver)
    DisposableEffect(recorder) {
        recorder.onInterrupted = { kept ->
            latestDeliver(kept)
            recording = recorder.session
        }
        onDispose {
            recorder.onInterrupted = null
            recorder.abandon { latestDeliver(it) }
            if (publishedTake.getAndSet(false)) recordingHost.retire()
        }
    }
    LaunchedEffect(recordingHost) {
        recordingHost.stopRequests.collect { if (recorder.session.isRecording) finishTake() }
    }
    LaunchedEffect(recordingHost) {
        recordingHost.cancelRequests.collect { if (recorder.session.isRecording) cancelTake() }
    }
    LaunchedEffect(recording.isRecording) {
        if (!recording.isRecording && publishedTake.getAndSet(false)) recordingHost.retire()
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) {
        val leaving = VoiceRecordingBackgroundLaw.Input(recorder.session.isRecording, recordingHost.keepsRecordingInBackground)
        if (VoiceRecordingBackgroundLaw.onAppLeft(leaving) == VoiceRecordingBackgroundLaw.Decision.AbandonToTray) {
            recorder.abandon(::deliver)
            recording = recorder.session
        }
    }
    LaunchedEffect(recording.isRecording) {
        while (recording.isRecording) {
            delay(100)
            recorder.tick(0.1)
            recording = recorder.session
            if (publishedTake.get()) recordingHost.updateTake(conversationTitle, recording.levels.takeLast(LEVEL_WINDOW))
        }
    }
    return ComposerVoiceHandle(
        isRecording = recording.isRecording,
        session = recording,
        request = { scope.launch { if (permissions.ensure(PermissionNature.MICROPHONE)) start() } },
        cancel = ::cancelTake,
        finish = ::finishTake,
        permissions = permissions,
    )
}

/** L'enregistreur partagé du dépôt (session, focus, garde d'appel) ; hors Hilt, un enregistreur isolé du même moteur. */
private fun sharedRecorder(context: android.content.Context): AudioRecordingProviding {
    val app = context.applicationContext
    val factory = runCatching {
        EntryPointAccessors.fromApplication(app, AudioRecorderEntryPoint::class.java).audioRecorderFactory()
    }.getOrNull()
    return factory?.create(AudioRecordingSettings.standard) ?: DefaultAudioRecorder(
        settings = AudioRecordingSettings.standard,
        directory = File(app.cacheDir, "voice"),
        engineFactory = { MediaRecorderEngine(app, it.profile) },
    )
}

/** Les mesures récentes dont la notification fait la moyenne (une seconde de micro). */
private const val LEVEL_WINDOW = 10

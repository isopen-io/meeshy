package me.meeshy.ui.component.recording

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.model.recording.AudioRecorderScreenLaw
import me.meeshy.sdk.model.recording.AudioRecorderSheetLaw
import me.meeshy.sdk.model.recording.RecorderHaptic
import me.meeshy.sdk.model.recording.RecorderScreenEvent
import me.meeshy.sdk.model.recording.RecorderScreenState
import me.meeshy.sdk.model.waveform.VoiceRecordingSession
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.sdk.recording.AudioRecordingResult
import me.meeshy.ui.component.permission.PermissionFlow
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics

private const val TICK_MILLIS = 100L
private const val TICK_SECONDS = 0.1

/** La demande de micro de l'enregistreur : rend l'état d'accès final, après l'explication éventuelle. */
public typealias MicrophoneAccess = suspend () -> MediaPermissionState

/**
 * Le moteur d'état partagé de l'enregistreur plein écran et de la feuille : il pilote UN enregistreur
 * ([AudioRecordingProviding]) par la machine [AudioRecorderScreenLaw], joue les haptiques qu'elle demande,
 * fait avancer l'horloge et applique le plafond optionnel. Les deux surfaces n'en sont que des projections.
 */
@Stable
internal class RecorderHandle(
    private val recorder: AudioRecordingProviding,
    private val requestMicrophone: MicrophoneAccess,
    private val scope: CoroutineScope,
    private val haptics: MeeshyHaptics,
    val capSeconds: Double?,
) {
    var screen: RecorderScreenState by mutableStateOf(RecorderScreenState())
        private set
    var session: VoiceRecordingSession by mutableStateOf(recorder.session)
        private set
    var take: AudioRecordingResult? by mutableStateOf(null)
        private set

    private fun dispatch(event: RecorderScreenEvent) {
        val transition = AudioRecorderScreenLaw.reduce(screen, event)
        screen = transition.state
        session = recorder.session
        when (transition.haptic) {
            RecorderHaptic.MEDIUM -> haptics.medium()
            RecorderHaptic.SUCCESS -> haptics.success()
            null -> Unit
        }
    }

    fun start() {
        if (screen.isRecording) return
        scope.launch {
            val access = requestMicrophone()
            dispatch(RecorderScreenEvent.PermissionResolved(access))
            if (access.isUsable) recorder.start { live -> dispatch(RecorderScreenEvent.Started(live)) }
        }
    }

    fun stop() {
        if (!screen.isRecording) return
        recorder.finish { result -> keep(result) }
    }

    fun cancel() {
        recorder.cancel()
        take = null
        dispatch(RecorderScreenEvent.Cancelled)
    }

    fun redo() {
        take?.file?.delete()
        take = null
        dispatch(RecorderScreenEvent.Redo)
    }

    /** La prise est remise à l'appelant : l'enregistreur redevient prêt SANS supprimer le fichier remis. */
    fun handOver() {
        take = null
        dispatch(RecorderScreenEvent.Redo)
    }

    fun interrupted(result: AudioRecordingResult?) = keep(result)

    fun leave() {
        if (screen.isRecording) recorder.cancel()
    }

    fun tick() {
        recorder.tick(TICK_SECONDS)
        session = recorder.session
        if (AudioRecorderSheetLaw.capReached(session.elapsedSeconds, capSeconds)) stop()
    }

    private fun keep(result: AudioRecordingResult?) {
        val kept = result?.takeIf { AudioRecorderSheetLaw.delivers(it.durationSeconds) }
        if (result != null && kept == null) result.file.delete()
        take = kept
        dispatch(RecorderScreenEvent.Finished(kept != null))
    }
}

@Composable
internal fun rememberRecorderHandle(
    recorder: AudioRecordingProviding,
    requestMicrophone: MicrophoneAccess,
    capSeconds: Double?,
): RecorderHandle {
    val scope = rememberCoroutineScope()
    val haptics = rememberMeeshyHaptics()
    val latestAccess by rememberUpdatedState(requestMicrophone)
    val handle = remember(recorder, capSeconds) {
        RecorderHandle(recorder, { latestAccess() }, scope, haptics, capSeconds)
    }
    DisposableEffect(handle) {
        recorder.onInterrupted = handle::interrupted
        onDispose {
            recorder.onInterrupted = null
            handle.leave()
        }
    }
    LaunchedEffect(handle, handle.screen.isRecording) {
        while (handle.screen.isRecording) {
            delay(TICK_MILLIS)
            handle.tick()
        }
    }
    return handle
}

/** L'accès au micro par la porte unique des permissions ; l'appelant la pose avec `PermissionFlowHost`. */
@Composable
internal fun rememberMicrophoneAccess(flow: PermissionFlow): MicrophoneAccess = remember(flow) {
    val access: MicrophoneAccess = {
        flow.ensure(PermissionNature.MICROPHONE, announcesRefusal = false)
        flow.stateOf(PermissionNature.MICROPHONE)
    }
    access
}

/** L'onde en direct : une barre par lecture du micro, la plus ancienne d'abord. */
@Composable
internal fun LiveRecordingWaveform(levels: List<Float>, accent: Color, active: Boolean, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        levels.forEach { level ->
            val height = if (active) 6f + 54f * level.coerceIn(0f, 1f) else 6f
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(height.dp)
                    .clip(RoundedCornerShape(1.5.dp))
                    .background(accent.copy(alpha = if (active) 0.9f else 0.3f)),
            )
        }
    }
}

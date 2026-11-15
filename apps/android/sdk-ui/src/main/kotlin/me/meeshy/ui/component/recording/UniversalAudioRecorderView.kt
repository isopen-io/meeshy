package me.meeshy.ui.component.recording

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import me.meeshy.sdk.model.recording.AudioRecorderSheetLaw
import me.meeshy.sdk.model.recording.MicRefusal
import me.meeshy.sdk.model.recording.RecorderScreenState
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.ui.R
import me.meeshy.ui.component.audio.editor.AudioEditorHost
import me.meeshy.ui.component.audio.editor.LocalAudioEditorHost
import me.meeshy.ui.component.audio.editor.NoAudioEditorHost
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Ce que l'enregistreur plein écran remet à l'appelant à l'acceptation : le fichier, sa durée et l'onde de la prise. */
public class RecordedAudio(
    public val file: File,
    public val durationSeconds: Double,
    public val levels: List<Float>,
    public val mimeType: String,
)

/**
 * L'enregistreur plein écran unifié (iOS `UniversalAudioRecorderView`) pour les messages, stories et posts :
 * gros bouton rond en bas, onde en temps réel, durée en chiffres, point rouge pulsant ; la prise terminée
 * s'ouvre en aperçu (onde, lecture, éditer, refaire, accepter). Un refus de micro s'explique sous les
 * contrôles avec un accès aux Réglages. L'accent est celui du contexte, passé en paramètre ; [onEdit] est le
 * point d'extension de l'éditeur audio (absent : pas de bouton).
 */
@Composable
public fun UniversalAudioRecorderView(
    recorder: AudioRecordingProviding,
    playback: AudioPlaybackEngine,
    contextLabel: String,
    contextIcon: ImageVector,
    accent: Color,
    onComplete: (RecordedAudio) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    capSeconds: Double? = null,
    onEdit: ((RecordedAudio) -> Unit)? = null,
    requestMicrophone: MicrophoneAccess? = null,
    onOpenSettings: (() -> Unit)? = null,
) {
    val permissions = rememberPermissionFlow()
    val access = requestMicrophone ?: rememberMicrophoneAccess(permissions)
    val handle = rememberRecorderHandle(recorder, access, capSeconds)
    val context = LocalContext.current
    val tokens = MeeshyTheme.tokens
    val take = handle.take
    val editor = LocalAudioEditorHost.current
    val edit = onEdit ?: editorEntry(editor, onComplete)
    Box(
        modifier
            .fillMaxSize()
            .background(tokens.backgroundPrimary)
            .background(Brush.verticalGradient(listOf(accent.copy(alpha = 0.12f), Color.Transparent))),
    ) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            RecorderHeader(contextLabel, contextIcon, accent) {
                handle.leave()
                onCancel()
            }
            Spacer(Modifier.weight(1f))
            Box(Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xxxl), contentAlignment = Alignment.Center) {
                if (handle.screen.isPreviewing && take != null) {
                    val recorded = RecordedAudio(take.file, take.durationSeconds, take.levels, take.mimeType)
                    RecordingPreview(
                        file = take.file,
                        durationSeconds = take.durationSeconds,
                        levels = take.levels,
                        accent = accent,
                        engine = playback,
                        onAccept = { onComplete(recorded) },
                        onRedo = handle::redo,
                        onEdit = edit?.let { open -> { open(recorded) } },
                    )
                } else {
                    RecorderCenter(handle, accent)
                }
            }
            Spacer(Modifier.weight(1f))
            MicRefusalNotice(handle.screen, onOpenSettings ?: { context.openAppSettings(); Unit })
            if (!handle.screen.isPreviewing) {
                RecorderControls(handle, accent, Modifier.padding(horizontal = MeeshySpacing.xl).padding(bottom = 40.dp))
            }
        }
        PermissionFlowHost(permissions, accent = accent)
    }
}

/**
 * Le bouton « éditer » de l'aperçu ouvre l'éditeur audio plein écran quand l'application en fournit un
 * (absent sinon, jamais grisé) : l'audio confirmé remplace la prise et l'enregistreur se conclut.
 */
private fun editorEntry(editor: AudioEditorHost, onComplete: (RecordedAudio) -> Unit): ((RecordedAudio) -> Unit)? {
    if (editor === NoAudioEditorHost) return null
    return { recorded ->
        editor.open(
            source = recorded.file,
            onConfirm = { edited ->
                val mime = if (edited.file.extension == "m4a") "audio/mp4" else recorded.mimeType
                onComplete(RecordedAudio(edited.file, edited.durationSeconds, emptyList(), mime))
            },
            onCancel = {},
        )
    }
}

@Composable
private fun RecorderHeader(label: String, icon: ImageVector, accent: Color, onClose: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val closeLabel = stringResource(R.string.audio_recorder_close)
    Row(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Box(
            Modifier
                .size(48.dp)
                .clip(CircleShape)
                .semantics { contentDescription = closeLabel; role = Role.Button }
                .clickable(onClick = onClose),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.Close, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(18.dp))
        }
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(accent.copy(alpha = 0.15f)).padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        ) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(14.dp))
            Text(label, color = accent, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.size(48.dp))
    }
}

@Composable
private fun RecorderCenter(handle: RecorderHandle, accent: Color) {
    val tokens = MeeshyTheme.tokens
    if (handle.screen.isRecording) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl)) {
            LiveRecordingWaveform(handle.session.levels, accent, active = true, modifier = Modifier.height(64.dp))
            ElapsedClock(AudioRecorderSheetLaw.elapsedLabel(handle.session.elapsedSeconds, handle.capSeconds))
            RecordingBadge()
        }
    } else {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
            Box(Modifier.size(100.dp).clip(CircleShape).background(accent.copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Icon(MeeshyIcons.Mic, contentDescription = null, tint = accent, modifier = Modifier.size(36.dp))
            }
            Text(stringResource(R.string.audio_recorder_tapToRecord), color = tokens.textMuted, fontSize = 16.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun ElapsedClock(text: String) {
    val tokens = MeeshyTheme.tokens
    val style = @Composable { value: String ->
        Text(value, color = tokens.textPrimary, fontSize = 48.sp, fontWeight = FontWeight.Light, fontFamily = FontFamily.Monospace)
    }
    if (LocalReduceMotion.current) style(text) else AnimatedContent(targetState = text, label = "elapsedClock") { style(it) }
}

@Composable
private fun RecordingBadge() {
    val tokens = MeeshyTheme.tokens
    val alpha = if (LocalReduceMotion.current) 1f else pulsingAlpha()
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus)) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(tokens.error.copy(alpha = alpha)))
        Text(stringResource(R.string.audio_recorder_recording), color = tokens.error, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun pulsingAlpha(): Float {
    val pulse by rememberInfiniteTransition(label = "recordingDot").animateFloat(
        initialValue = 1f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(500), RepeatMode.Reverse),
        label = "recordingDotAlpha",
    )
    return pulse
}

@Composable
private fun MicRefusalNotice(state: RecorderScreenState, onOpenSettings: () -> Unit) {
    val refusal = state.refusal ?: return
    val tokens = MeeshyTheme.tokens
    Column(
        Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xxxl).padding(bottom = MeeshySpacing.md),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            stringResource(if (refusal == MicRefusal.NEEDS_SETTINGS) R.string.audio_recorder_micDeniedSettings else R.string.audio_recorder_micDenied),
            color = tokens.error,
            fontSize = 15.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
        )
        Box(
            Modifier
                .height(48.dp)
                .clip(RoundedCornerShape(50))
                .background(tokens.controlFill)
                .clickable(role = Role.Button, onClick = onOpenSettings)
                .padding(horizontal = MeeshySpacing.xl),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.media_permission_open_settings), color = tokens.textPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun RecorderControls(handle: RecorderHandle, accent: Color, modifier: Modifier = Modifier) {
    val tokens = MeeshyTheme.tokens
    val recording = handle.screen.isRecording
    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        Row(horizontalArrangement = Arrangement.spacedBy(40.dp), verticalAlignment = Alignment.CenterVertically) {
            if (recording) {
                RoundControl(
                    size = 56.dp,
                    fill = tokens.controlFill,
                    description = stringResource(R.string.audio_recorder_cancel),
                    onClick = handle::cancel,
                ) { Icon(MeeshyIcons.Delete, contentDescription = null, tint = tokens.error, modifier = Modifier.size(24.dp)) }
            }
            RoundControl(
                size = 80.dp,
                fill = if (recording) tokens.error else accent,
                description = stringResource(if (recording) R.string.story_voiceRecorder_stop else R.string.story_voiceRecorder_start),
                onClick = { if (recording) handle.stop() else handle.start() },
            ) {
                Icon(if (recording) MeeshyIcons.Stop else MeeshyIcons.Mic, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
            }
            if (recording) Spacer(Modifier.size(56.dp))
        }
        if (!recording) {
            Text(stringResource(R.string.audio_recorder_record), color = tokens.textMuted, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun RoundControl(
    size: androidx.compose.ui.unit.Dp,
    fill: Color,
    description: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(fill)
            .semantics { contentDescription = description; role = Role.Button }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { content() }
}

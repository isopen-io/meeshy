package me.meeshy.ui.component.recording

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.recording.AudioRecorderSheetLaw
import me.meeshy.sdk.model.recording.RecorderSource
import me.meeshy.sdk.model.recording.SpokenLanguageStripLaw
import me.meeshy.sdk.recording.AudioRecordingProviding
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.openAppSettings
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * LA feuille d'enregistrement audio partagée par stories, posts et réels (iOS `AudioRecorderSheet`) : un
 * appui démarre, un appui arrête, sans limite de durée sauf [capSeconds] (alors « écoulé / plafond »). Les
 * puces « Fichiers » et « Bibliothèque » n'existent que si leur porte est fournie et disparaissent pendant
 * la prise, comme la fente [accessory] posée sous le bouton (rôle de mixage, rognage : décisions du produit,
 * pas de l'enregistreur). La bande de langue parlée étiquette la prise ; un hôte qui a son propre sélecteur
 * la masque par [showsLanguageStrip] = faux. [onRecordComplete] rend le fichier et la langue.
 */
@Composable
public fun AudioRecorderSheet(
    recorder: AudioRecordingProviding,
    accent: Color,
    onRecordComplete: (RecordedAudio, String) -> Unit,
    modifier: Modifier = Modifier,
    preferredLanguage: String? = null,
    showsLanguageStrip: Boolean = true,
    capSeconds: Double? = null,
    onImportAudioFile: (() -> Unit)? = null,
    onOpenSoundLibrary: (() -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
    requestMicrophone: MicrophoneAccess? = null,
    onOpenSettings: (() -> Unit)? = null,
) {
    val permissions = rememberPermissionFlow()
    val access = requestMicrophone ?: rememberMicrophoneAccess(permissions)
    val handle = rememberRecorderHandle(recorder, access, capSeconds)
    val context = LocalContext.current
    var language by remember(preferredLanguage) { mutableStateOf(SpokenLanguageStripLaw.initialSelection(preferredLanguage)) }
    val latestLanguage by rememberUpdatedState(language)
    val latestComplete by rememberUpdatedState(onRecordComplete)
    val take = handle.take
    LaunchedEffect(take, handle.screen.phase) {
        if (take != null && handle.screen.isPreviewing) {
            latestComplete(RecordedAudio(take.file, take.durationSeconds, take.levels, take.mimeType), latestLanguage)
            handle.handOver()
        }
    }
    val tokens = MeeshyTheme.tokens
    val recording = handle.screen.isRecording
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.xl))
            .background(tokens.surfaceFill)
            .padding(MeeshySpacing.lg),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SheetHeader(accent)
        val sources = AudioRecorderSheetLaw.sources(recording, onImportAudioFile != null, onOpenSoundLibrary != null)
        if (sources.isNotEmpty()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                sources.forEach { source ->
                    when (source) {
                        RecorderSource.FILES -> SourceChip(MeeshyIcons.Folder, stringResource(R.string.story_voiceRecorder_fromFiles), onImportAudioFile)
                        RecorderSource.LIBRARY -> SourceChip(MeeshyIcons.QueueMusic, stringResource(R.string.story_voiceRecorder_fromLibrary), onOpenSoundLibrary)
                    }
                }
            }
        }
        LiveRecordingWaveform(handle.session.levels, accent, active = recording, modifier = Modifier.height(56.dp).padding(horizontal = MeeshySpacing.xl))
        Text(
            text = if (recording) {
                AudioRecorderSheetLaw.elapsedLabel(handle.session.elapsedSeconds, capSeconds)
            } else {
                stringResource(R.string.audio_recorder_tapToRecord)
            },
            color = if (recording) accent else tokens.textMuted,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = FontFamily.Monospace,
        )
        if (showsLanguageStrip) {
            SpokenLanguageStrip(selected = language, onSelect = { language = it }, accent = accent, modifier = Modifier.fillMaxWidth().height(48.dp))
        }
        SheetControls(handle, accent)
        MicRefusalNoticeInline(handle, onOpenSettings ?: { context.openAppSettings(); Unit })
        if (AudioRecorderSheetLaw.showsAccessory(recording, accessory != null)) {
            Box(Modifier.fillMaxWidth()) { accessory?.invoke() }
        }
        PermissionFlowHost(permissions, accent = accent)
    }
}

@Composable
private fun SheetHeader(accent: Color) {
    val tokens = MeeshyTheme.tokens
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Icon(MeeshyIcons.Mic, contentDescription = null, tint = accent, modifier = Modifier.size(20.dp))
        Text(stringResource(R.string.story_voiceRecorder_title), color = tokens.textPrimary, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun SourceChip(icon: ImageVector, text: String, onClick: (() -> Unit)?) {
    val tokens = MeeshyTheme.tokens
    Row(
        Modifier
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(tokens.controlFill)
            .clickable(role = Role.Button, onClick = { onClick?.invoke() })
            .padding(horizontal = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Icon(icon, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(16.dp))
        Text(text, color = tokens.textPrimary, fontSize = 13.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SheetControls(handle: RecorderHandle, accent: Color) {
    val tokens = MeeshyTheme.tokens
    val recording = handle.screen.isRecording
    val reduceMotion = LocalReduceMotion.current
    val scale by animateFloatAsState(if (recording && !reduceMotion) 1.1f else 1f, spring(dampingRatio = 0.6f), label = "recordScale")
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxxl), verticalAlignment = Alignment.CenterVertically) {
        if (recording) {
            val cancelLabel = stringResource(R.string.audio_recorder_cancel)
            Box(
                Modifier
                    .size(50.dp)
                    .clip(CircleShape)
                    .background(tokens.controlFill)
                    .semantics { contentDescription = cancelLabel; role = Role.Button }
                    .clickable(onClick = handle::cancel),
                contentAlignment = Alignment.Center,
            ) { Icon(MeeshyIcons.Close, contentDescription = null, tint = tokens.textSecondary, modifier = Modifier.size(22.dp)) }
        }
        val label = stringResource(if (recording) R.string.story_voiceRecorder_stop else R.string.story_voiceRecorder_start)
        Box(
            Modifier
                .size(72.dp)
                .scale(scale)
                .clip(CircleShape)
                .background(if (recording) accent else tokens.controlFill)
                .semantics { contentDescription = label; role = Role.Button }
                .clickable { if (recording) handle.stop() else handle.start() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (recording) MeeshyIcons.Stop else MeeshyIcons.Mic,
                contentDescription = null,
                tint = if (recording) Color.White else tokens.textSecondary,
                modifier = Modifier.size(32.dp),
            )
        }
        if (recording) Box(Modifier.size(50.dp))
    }
}

@Composable
private fun MicRefusalNoticeInline(handle: RecorderHandle, onOpenSettings: () -> Unit) {
    val refusal = handle.screen.refusal ?: return
    val tokens = MeeshyTheme.tokens
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        Text(
            stringResource(
                if (refusal == me.meeshy.sdk.model.recording.MicRefusal.NEEDS_SETTINGS) R.string.audio_recorder_micDeniedSettings else R.string.audio_recorder_micDenied,
            ),
            color = tokens.error,
            fontSize = 14.sp,
        )
        Box(
            Modifier
                .heightIn(min = 48.dp)
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(tokens.controlFill)
                .clickable(role = Role.Button, onClick = onOpenSettings)
                .padding(horizontal = MeeshySpacing.xl),
            contentAlignment = Alignment.Center,
        ) { Text(stringResource(R.string.media_permission_open_settings), color = tokens.textPrimary, fontSize = 13.sp) }
    }
}

/** La porte « Fichiers » : le sélecteur de documents du système, filtré sur l'audio. */
@Composable
public fun rememberAudioDocumentPicker(onPicked: (Uri) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(onPicked) }
    return remember(launcher) { { launcher.launch(arrayOf("audio/*")) } }
}

/** La porte « Bibliothèque » : le sélecteur de contenu du système, filtré sur l'audio. */
@Composable
public fun rememberAudioLibraryPicker(onPicked: (Uri) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> uri?.let(onPicked) }
    return remember(launcher) { { launcher.launch("audio/*") } }
}

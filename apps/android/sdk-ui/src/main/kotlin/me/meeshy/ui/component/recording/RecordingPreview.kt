package me.meeshy.ui.component.recording

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.io.File
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.recording.PreviewPlayCommand
import me.meeshy.sdk.model.recording.RecordingPreviewPlaybackLaw
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.ui.R
import me.meeshy.ui.component.audio.AudioPlayerActions
import me.meeshy.ui.component.audio.AudioPlayerState
import me.meeshy.ui.component.audio.AudioPlayerView
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** L'identifiant sous lequel l'aperçu d'une prise se charge dans le moteur audio unique. */
public const val RECORDING_PREVIEW_PLAYBACK_ID: String = "recorder-preview"

/**
 * L'aperçu d'une prise (iOS `MeeshyAudioEditorView` à l'ouverture) : l'onde de toute la prise avec sa lecture
 * par le moteur audio unique, puis les contrôles « éditer » (point d'extension : absent si [onEdit] est nul),
 * « refaire » et « accepter ». Quitter l'aperçu arrête la lecture qu'il a lancée.
 */
@Composable
public fun RecordingPreview(
    file: File,
    durationSeconds: Double,
    levels: List<Float>,
    accent: Color,
    engine: AudioPlaybackEngine,
    onAccept: () -> Unit,
    onRedo: () -> Unit,
    modifier: Modifier = Modifier,
    onEdit: (() -> Unit)? = null,
) {
    val playback by engine.state.collectAsState()
    val view = RecordingPreviewPlaybackLaw.view(playback, RECORDING_PREVIEW_PLAYBACK_ID, durationSeconds)
    DisposableEffect(engine) {
        onDispose { if (engine.state.value.attachmentId == RECORDING_PREVIEW_PLAYBACK_ID) engine.stop() }
    }
    val state = AudioPlayerState(
        isPlaying = view.isPlaying,
        isLoading = view.isLoading,
        liveFraction = view.fraction,
        liveElapsedSeconds = view.elapsedSeconds,
        restingFraction = 0.0,
        durationSeconds = view.durationSeconds,
        samples = levels,
    )
    val actions = remember(engine, file) {
        AudioPlayerActions(
            onPlayPause = {
                when (RecordingPreviewPlaybackLaw.command(engine.state.value, RECORDING_PREVIEW_PLAYBACK_ID)) {
                    PreviewPlayCommand.LOAD_AND_PLAY ->
                        engine.playLocal(RECORDING_PREVIEW_PLAYBACK_ID, file.toURI().toString())
                    PreviewPlayCommand.TOGGLE -> engine.togglePlayPause()
                }
            },
            onSeek = { fraction ->
                if (engine.state.value.attachmentId == RECORDING_PREVIEW_PLAYBACK_ID) engine.seek(fraction)
            },
            onCycleSpeed = {
                if (engine.state.value.attachmentId == RECORDING_PREVIEW_PLAYBACK_ID) engine.cycleSpeed()
            },
        )
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl)) {
        AudioPlayerView(
            state = state,
            context = MediaPlayerContext.COMPOSER_ATTACHMENT,
            accent = accent,
            actions = actions,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (onEdit != null) {
                PreviewControl(MeeshyIcons.Edit, stringResource(R.string.audio_recorder_edit), onEdit, filled = false, accent = accent)
            }
            PreviewControl(MeeshyIcons.Delete, stringResource(R.string.audio_recorder_redo), onRedo, filled = false, accent = accent)
            PreviewControl(MeeshyIcons.Check, stringResource(R.string.audio_recorder_accept), onAccept, filled = true, accent = accent, size = 72.dp)
        }
    }
}

@Composable
private fun PreviewControl(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    description: String,
    onClick: () -> Unit,
    filled: Boolean,
    accent: Color,
    size: Dp = 56.dp,
) {
    val tokens = MeeshyTheme.tokens
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(if (filled) accent else tokens.controlFill)
            .semantics {
                contentDescription = description
                role = Role.Button
            }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = if (filled) Color.White else tokens.textPrimary, modifier = Modifier.size(size / 2.4f))
    }
}

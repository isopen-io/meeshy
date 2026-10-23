package me.meeshy.ui.component.bubble

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * What the in-thread player is doing with ONE voice note — handed by the host to the bubble
 * that owns [attachmentId], `null` for every other bubble. The bubble renders it; it never
 * plays anything itself.
 */
public data class BubbleAudioPlayback(
    val attachmentId: String,
    val isPlaying: Boolean,
    val isLoading: Boolean,
    /** `0…1` of the clip already played. */
    val progress: Float,
    /** `écoulé / total`, each `m:ss`. */
    val timeLabel: String,
)

/**
 * Compact voice-note row — Android render of the iOS `AudioPlayerView` message-bubble
 * context. Idle, it shows a play affordance, the `m:ss` duration (or the download size) and
 * the Prisme-resolved transcription. Once the host plays it ([playback] non-null) it shows
 * pause or loading, a progress bar and `elapsed / total`, so the voice note is listened to
 * IN the thread (iOS `AudioBubbleRouter` / `MediaConsumptionProgressBar`).
 */
@Composable
internal fun AudioBubble(
    audio: BubbleAudio,
    playback: BubbleAudioPlayback?,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val actionLabel = stringResource(
        if (playback?.isPlaying == true) R.string.fullscreen_pause else R.string.bubble_audio_play,
    )
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(onColor.copy(alpha = 0.1f))
            .let { base ->
                if (onClick == null) base
                else base.clickable(onClick = onClick).semantics {
                    role = Role.Button
                    contentDescription = actionLabel
                }
            }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            Box(modifier = Modifier.size(24.dp), contentAlignment = Alignment.Center) {
                if (playback?.isLoading == true) {
                    CircularProgressIndicator(
                        color = onColor.copy(alpha = 0.9f),
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Icon(
                        imageVector = when {
                            !audio.isPlayable -> Icons.Filled.Download
                            playback?.isPlaying == true -> Icons.Filled.Pause
                            else -> Icons.Filled.PlayArrow
                        },
                        contentDescription = null,
                        tint = onColor.copy(alpha = 0.9f),
                        modifier = Modifier.size(24.dp),
                    )
                }
            }
            if (playback != null) {
                LinearProgressIndicator(
                    progress = { playback.progress.coerceIn(0f, 1f) },
                    color = onColor.copy(alpha = 0.9f),
                    trackColor = onColor.copy(alpha = 0.2f),
                    modifier = Modifier
                        .width(96.dp)
                        .height(3.dp)
                        .clip(RoundedCornerShape(MeeshyRadius.pill)),
                )
            }
            val meta = playback?.timeLabel
                ?: audio.formattedDuration
                ?: audio.sizeBytes?.takeIf { it > 0 }?.let { formatFileSize(it) }
            if (meta != null) {
                Text(
                    text = meta,
                    style = MaterialTheme.typography.bodySmall,
                    color = onColor,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        if (audio.hasTranscription) {
            Text(
                text = audio.transcriptionText.orEmpty(),
                style = MaterialTheme.typography.labelSmall,
                color = onColor.copy(alpha = 0.75f),
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
    }
}

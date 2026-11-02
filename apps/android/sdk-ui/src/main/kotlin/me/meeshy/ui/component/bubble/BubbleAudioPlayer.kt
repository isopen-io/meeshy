package me.meeshy.ui.component.bubble

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.AudioTranscriptionReveal
import me.meeshy.ui.R
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
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
    /** Position du lecteur, en secondes : le karaoké de la transcription s'y aligne (#13878). */
    val currentSeconds: Double = 0.0,
)

/**
 * Compact voice-note row — Android render of the iOS `AudioPlayerView` message-bubble
 * context. Idle, it shows a play affordance, the `m:ss` duration (or the download size) and
 * the Prisme-resolved transcription. Once the host plays it ([playback] non-null) it shows
 * pause or loading, a progress bar and `elapsed / total`, so the voice note is listened to
 * IN the thread (iOS `AudioBubbleRouter` / `MediaConsumptionProgressBar`). While it plays, the transcription
 * lights the segment being said (iOS `inlineFlowTranscription`, #13878) and a touch on a word seeks there ([onSeek]).
 */
@Composable
public fun AudioBubble(
    audio: BubbleAudio,
    playback: BubbleAudioPlayback?,
    onColor: Color,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
    autoRevealTranscription: Boolean = true,
    onSeek: ((Double) -> Unit)? = null,
) {
    val segments = remember(audio) { audio.karaokeSegments }
    val frame = BubbleAudioKaraoke.frame(segments, playback)
    var revealed by remember(audio.attachmentId) { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
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
            val showCta = AudioTranscriptionReveal.shouldShowRevealCta(
                hasTranscription = true,
                autoReveal = autoRevealTranscription,
                manuallyRevealed = revealed,
            )
            AnimatedContent(
                targetState = showCta,
                transitionSpec = { fadeIn(tween(TRANSCRIPT_FADE_MILLIS)) togetherWith fadeOut(tween(TRANSCRIPT_FADE_MILLIS)) },
                label = "audioTranscriptReveal",
            ) { cta ->
                when {
                    cta -> RevealTranscriptionCta(
                        onColor = onColor,
                        onReveal = {
                            haptics.light()
                            revealed = true
                        },
                    )
                    else -> KaraokeTranscript(
                        segments = segments,
                        frame = frame,
                        onColor = onColor,
                        onSeek = onSeek?.takeIf { playback != null },
                        modifier = Modifier.padding(top = MeeshySpacing.xs),
                    )
                }
            }
        }
    }
}

private const val TRANSCRIPT_FADE_MILLIS = 180

/**
 * iOS `AudioPlayerView.transcriptionBlock` : la transcription existe mais son affichage automatique
 * est coupé sur les messages reçus. Le tap ne fait que la révéler, aucune requête n'est émise.
 */
@Composable
private fun RevealTranscriptionCta(onColor: Color, onReveal: () -> Unit) {
    Row(
        modifier = Modifier
            .padding(top = MeeshySpacing.xs)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button, onClick = onReveal)
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(
            imageVector = MeeshyIcons.AddToList,
            contentDescription = null,
            tint = onColor.copy(alpha = 0.6f),
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = stringResource(R.string.media_audio_transcribe),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = onColor.copy(alpha = 0.6f),
        )
    }
}

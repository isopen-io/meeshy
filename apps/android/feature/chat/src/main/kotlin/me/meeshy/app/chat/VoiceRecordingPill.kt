package me.meeshy.app.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The iMessage-style voice-recording pill — the thin, coverage-exempt Compose glue
 * over the pure [VoiceRecordingSession]. It renders the four regions of the iOS
 * `recordingBar` (cancel · live waveform · blinking dot + timer · stop/send) and
 * forwards each control to a session transition supplied by the composer.
 *
 * All state and gating live in the [session]; this composable only paints it. The
 * stop and send controls dim and disable below [VoiceRecordingSession.canSend],
 * exactly like the iOS pill, so an unusably short take can never be sent.
 */
@Composable
internal fun VoiceRecordingPill(
    session: VoiceRecordingSession,
    accentColor: Color,
    onCancel: () -> Unit,
    onStop: () -> Unit,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val canSend = session.canSend

    Surface(
        color = accentColor.copy(alpha = 0.06f),
        shape = RoundedCornerShape(22.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.xs, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            IconButton(onClick = onCancel) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(tokens.error.copy(alpha = 0.14f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = "Cancel recording",
                        tint = tokens.error,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }

            RecordingWaveform(
                accentColor = accentColor,
                modifier = Modifier
                    .weight(1f)
                    .height(28.dp),
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(tokens.error.copy(alpha = session.recordingDotOpacity(reduceMotion = false))),
                )
                Text(
                    text = session.formattedElapsed,
                    color = tokens.textPrimary,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 13.sp,
                )
            }

            IconButton(onClick = onStop, enabled = canSend) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = if (canSend) 0.12f else 0.05f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Stop,
                        contentDescription = "Stop and add to attachments",
                        tint = accentColor.copy(alpha = if (canSend) 1f else 0.4f),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }

            IconButton(onClick = onSend, enabled = canSend) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .background(accentColor.copy(alpha = if (canSend) 1f else 0.4f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Send voice message",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
    }
}

/**
 * A lively synthetic waveform strip painted while recording. Until live microphone
 * metering is wired ([VoiceRecordingSession.meter] is fed by an app-side recorder),
 * the bars breathe on staggered infinite transitions so the pill reads as "live",
 * mirroring the iOS `ComposerWaveformBar` fallback used when no external levels
 * are available.
 */
@Composable
private fun RecordingWaveform(
    accentColor: Color,
    modifier: Modifier = Modifier,
    barCount: Int = 24,
) {
    val transition = rememberInfiniteTransition(label = "waveform")
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        repeat(barCount) { index ->
            val phase = 320 + (index % 6) * 90
            val level by transition.animateFloat(
                initialValue = 0.15f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(durationMillis = phase),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "bar$index",
            )
            Box(
                modifier = Modifier
                    .width(2.5.dp)
                    .height((3f + 22f * level).dp)
                    .clip(RoundedCornerShape(1.25.dp))
                    .background(accentColor.copy(alpha = 0.75f)),
            )
        }
    }
}

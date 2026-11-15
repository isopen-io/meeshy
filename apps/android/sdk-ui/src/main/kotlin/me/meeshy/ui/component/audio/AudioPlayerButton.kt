package me.meeshy.ui.component.audio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.sdk.model.media.AudioAvailability
import me.meeshy.sdk.model.waveform.AudioByteLabels
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.boundedScale

private const val ACCENT_TAIL_ALPHA = 0.7f
private const val SHADOW_ALPHA = 0.3f

/**
 * Bouton rond du lecteur vocal (40 dp, 34 en compact) : dégradé accent -> accent 70 %, ombre 6 dp,
 * pause/play (le triangle décalé de 1 dp), spinner pendant le chargement, flèche si le fichier est
 * à télécharger, anneau de 50 % pendant le téléchargement. L'accent vient de la conversation.
 */
@Composable
public fun AudioPlayerButton(
    availability: AudioAvailability,
    isPlaying: Boolean,
    isLoading: Boolean,
    isCompact: Boolean,
    isDark: Boolean,
    accent: Color,
    fileSizeBytes: Long,
    onPlayPause: () -> Unit,
    onDownload: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = rememberMeeshyHaptics()
    val size = if (isCompact) 34.dp else 40.dp
    val iconSize = if (isCompact) 13.dp else 15.dp
    val label = stringResource(R.string.media_audio_play)
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Box(
            modifier = Modifier
                .semantics {
                    contentDescription = label
                    role = Role.Button
                }
                .clickable(enabled = availability !is AudioAvailability.Downloading) {
                    haptics.light()
                    if (availability is AudioAvailability.NeedsDownload) onDownload() else onPlayPause()
                }
                .meeshyTapTarget()
                .size(size)
                .shadow(6.dp, CircleShape, ambientColor = accent.copy(SHADOW_ALPHA), spotColor = accent.copy(SHADOW_ALPHA))
                .background(Brush.linearGradient(listOf(accent, accent.copy(ACCENT_TAIL_ALPHA))), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            ButtonGlyph(availability, isPlaying, isLoading, size, iconSize)
        }
        AudioAvailabilityCaption(availability, fileSizeBytes, isDark)
    }
}

@Composable
private fun ButtonGlyph(
    availability: AudioAvailability,
    isPlaying: Boolean,
    isLoading: Boolean,
    size: androidx.compose.ui.unit.Dp,
    iconSize: androidx.compose.ui.unit.Dp,
) {
    when (availability) {
        AudioAvailability.Ready ->
            if (isLoading) Spinner()
            else Icon(
                imageVector = if (isPlaying) MeeshyIcons.Pause else MeeshyIcons.Play,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(iconSize).offset(x = if (isPlaying) 0.dp else 1.dp).decorative(),
            )
        AudioAvailability.NeedsDownload ->
            Icon(MeeshyIcons.Download, null, tint = Color.White, modifier = Modifier.size(iconSize).decorative())
        is AudioAvailability.Downloading ->
            if (availability.progress > 0) {
                Canvas(Modifier.size(size * 0.5f).decorative()) {
                    drawArc(
                        color = Color.White,
                        startAngle = -90f,
                        sweepAngle = (availability.progress.coerceIn(0.0, 1.0) * 360).toFloat(),
                        useCenter = false,
                        topLeft = Offset.Zero,
                        size = Size(this.size.width, this.size.height),
                        style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round),
                    )
                }
            } else Spinner()
    }
}

@Composable
private fun Spinner() {
    CircularProgressIndicator(
        modifier = Modifier.size(14.dp).decorative(),
        color = Color.White,
        strokeWidth = 2.dp,
    )
}

/** Taille « à télécharger » ou octets « téléchargés / total » sous le bouton, en monospace micro. */
@Composable
internal fun AudioAvailabilityCaption(availability: AudioAvailability, fileSizeBytes: Long, isDark: Boolean) {
    val text = when (availability) {
        AudioAvailability.Ready -> ""
        AudioAvailability.NeedsDownload -> AudioByteLabels.needsDownload(fileSizeBytes)
        is AudioAvailability.Downloading ->
            AudioByteLabels.downloading(availability.downloadedBytes, availability.totalBytes, fileSizeBytes)
    }
    if (text.isEmpty()) return
    Text(
        text = text,
        maxLines = 1,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.SemiBold,
        fontSize = 9.sp.boundedScale(),
        color = if (isDark) Color.White.copy(alpha = 0.65f) else Color.Black.copy(alpha = 0.55f),
    )
}

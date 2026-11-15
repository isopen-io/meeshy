package me.meeshy.app.chat

import android.text.format.Formatter
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.media.UploadBarProgress
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.LocalMeeshyTokens
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

private const val FULL_TURN_DEGREES = 360f
private const val TURN_MILLIS = 500
private const val TRACK_ALPHA = 0.15f
private const val BORDER_ALPHA = 0.2f
private val TrackHeight = 6.dp
private val IconSize = 20.dp

/**
 * La barre d'envoi GLOBALE des pièces jointes (iOS `UploadProgressBar`) : l'icône qui fait un tour complet à 100 %, le nom du
 * fichier en cours, le pourcentage, la barre linéaire à l'accent de la conversation, puis « x/y fichiers » et les octets.
 * Un seul nœud TalkBack : « Envoi des fichiers », valeur « n %, x fichiers sur y envoyés, <nom> ».
 */
@Composable
internal fun UploadProgressBar(progress: UploadBarProgress, accent: Color, modifier: Modifier = Modifier) {
    val tokens = LocalMeeshyTokens.current
    val percentage = progress.percentage
    val turn by animateFloatAsState(
        targetValue = if (progress.isComplete) FULL_TURN_DEGREES else 0f,
        animationSpec = if (LocalReduceMotion.current) tween(0) else tween(TURN_MILLIS),
        label = "uploadBarTurn",
    )
    val label = stringResource(R.string.upload_progress_a11y_label)
    val phrase = stringResource(R.string.upload_progress_a11y_value, percentage, progress.completedFiles, progress.totalFiles)
    val value = progress.currentFileName?.let { "$phrase, $it" } ?: phrase
    val shape = RoundedCornerShape(MeeshyRadius.smPlus)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tokens.surfaceFill)
            .border(1.dp, accent.copy(alpha = BORDER_ALPHA), shape)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm)
            .clearAndSetSemantics {
                contentDescription = label
                stateDescription = value
                if (!progress.isComplete) liveRegion = LiveRegionMode.Polite
            },
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            Icon(MeeshyIcons.ArrowUp, contentDescription = null, tint = accent, modifier = Modifier.size(IconSize).rotate(turn))
            Text(
                text = progress.currentFileName.orEmpty(),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "$percentage%",
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
                color = accent,
            )
        }
        LinearTrack(fraction = percentage / 100f, accent = accent)
        val context = LocalContext.current
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = stringResource(R.string.upload_progress_files_count, progress.completedFiles, progress.totalFiles),
                style = MaterialTheme.typography.labelSmall,
                color = tokens.textMuted,
            )
            Text(
                text = Formatter.formatShortFileSize(context, progress.uploadedBytes) + " / " + Formatter.formatShortFileSize(context, progress.totalBytes),
                style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                color = tokens.textMuted,
            )
        }
    }
}

@Composable
private fun LinearTrack(fraction: Float, accent: Color) {
    val animated by animateFloatAsState(
        targetValue = fraction.coerceIn(0f, 1f),
        animationSpec = if (LocalReduceMotion.current) tween(0) else tween(TURN_MILLIS),
        label = "uploadBarFill",
    )
    val shape = RoundedCornerShape(TrackHeight / 2)
    Box(modifier = Modifier.fillMaxWidth().height(TrackHeight).clip(shape).background(accent.copy(alpha = TRACK_ALPHA))) {
        Box(modifier = Modifier.fillMaxWidth(animated).height(TrackHeight).clip(shape).background(accent))
    }
}

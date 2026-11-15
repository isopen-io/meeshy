package me.meeshy.ui.component.bubble

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/** L'étiquette de test du bouton « Re-transcrire » d'une transcription déjà révélée. */
internal const val BUBBLE_RETRANSCRIBE_TAG: String = "bubbleRetranscribe"

/**
 * « Re-transcrire » (iOS `retranscribeButton`) : redemande la transcription d'un vocal déjà transcrit. Discret, sous le karaoké,
 * jamais offert pour un vocal protégé ou pas encore envoyé (l'hôte ne passe [onClick] que s'il est permis).
 */
@Composable
internal fun RetranscribeButton(onColor: Color, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .padding(top = MeeshySpacing.xs)
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .padding(vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        if (enabled) {
            Icon(
                imageVector = MeeshyIcons.Refresh,
                contentDescription = null,
                tint = onColor.copy(alpha = 0.6f),
                modifier = Modifier.size(14.dp),
            )
        } else {
            CircularProgressIndicator(
                modifier = Modifier.size(12.dp),
                strokeWidth = 1.5.dp,
                color = onColor.copy(alpha = 0.5f),
            )
        }
        Text(
            text = stringResource(R.string.media_audio_retranscribe),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            color = onColor.copy(alpha = if (enabled) 0.6f else 0.3f),
        )
    }
}

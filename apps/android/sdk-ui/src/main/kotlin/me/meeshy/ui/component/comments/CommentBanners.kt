package me.meeshy.ui.component.comments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Le fil n'a pas pu se charger et rien n'est gardé : le message et « Réessayer ». */
@Composable
public fun CommentsErrorBanner(message: String, retryLabel: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.sm)) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onRetry) { Text(retryLabel, color = MeeshyPalette.Indigo500) }
    }
}

/** Aucun commentaire encore : l'invitation à écrire le premier. */
@Composable
public fun CommentsEmptyBanner(message: String, modifier: Modifier = Modifier) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.md),
    )
}

/** Hors ligne et rien en cache : un état discret, jamais un écran d'erreur. */
@Composable
public fun CommentsOfflineEmptyBanner(message: String, modifier: Modifier = Modifier) {
    Text(
        text = message,
        style = MaterialTheme.typography.bodyMedium,
        color = MeeshyPalette.Warning,
        textAlign = TextAlign.Center,
        modifier = modifier.fillMaxWidth().padding(vertical = MeeshySpacing.md).semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** Hors ligne avec un fil déjà affiché : le bandeau fin au-dessus, les commentaires gardés restent lisibles. */
@Composable
public fun CommentsOfflineBand(message: String, modifier: Modifier = Modifier) {
    Text(
        text = message,
        style = MaterialTheme.typography.labelMedium,
        color = MeeshyPalette.Warning,
        textAlign = TextAlign.Center,
        modifier = modifier
            .fillMaxWidth()
            .background(MeeshyPalette.Warning.copy(alpha = 0.18f))
            .padding(vertical = MeeshySpacing.xs)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/**
 * Le bandeau commun au-dessus du composeur pendant une ÉDITION ou une RÉPONSE (iOS `CommentEditingBanner` /
 * `CommentReplyBanner`) : une barre d'accent (réponse) ou une icône (édition), le titre, la première ligne citée, et la
 * croix qui annule. [accent] vient de l'appelant (couleur de l'auteur visé ou de la conversation), jamais d'un littéral.
 */
@Composable
public fun CommentComposerBanner(
    title: String,
    cancelLabel: String,
    accent: Color,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
    quote: String? = null,
    icon: ImageVector? = null,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = BANNER_ALPHA))
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xsPlus),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
        } else {
            Box(Modifier.width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(accent))
        }
        Column(Modifier.weight(1f).padding(start = MeeshySpacing.sm)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (icon != null) FontWeight.Medium else FontWeight.SemiBold,
                color = if (icon != null) MeeshyTheme.tokens.textSecondary else accent,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (!quote.isNullOrBlank()) {
                Text(
                    text = quote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        IconButton(onClick = onCancel, modifier = Modifier.size(48.dp)) {
            Icon(MeeshyIcons.Close, contentDescription = cancelLabel, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(16.dp))
        }
    }
}

private const val BANNER_ALPHA = 0.6f

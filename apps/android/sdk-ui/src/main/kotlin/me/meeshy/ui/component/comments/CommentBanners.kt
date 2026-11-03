package me.meeshy.ui.component.comments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
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

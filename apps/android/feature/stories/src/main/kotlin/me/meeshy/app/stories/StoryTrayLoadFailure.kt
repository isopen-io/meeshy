package me.meeshy.app.stories

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.stories.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La panne de chargement du plateau, DISTINCTE de « aucune story » (iOS `loadFailure`, #7007) : le rail dit la panne
 * et propose de réessayer plutôt que de se taire. Montrée seulement sur un plateau vide — un plateau garni reste
 * affiché tel quel (cache d'abord, jamais d'écran d'erreur par-dessus des données).
 */
@Composable
internal fun StoryTrayLoadFailure(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val errorColor = MeeshyTheme.tokens.error
    Row(
        modifier = modifier
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .clip(MaterialTheme.shapes.medium)
            .background(errorColor.copy(alpha = 0.10f))
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(MeeshyIcons.Error, contentDescription = null, tint = errorColor)
        Text(
            text = stringResource(R.string.stories_tray_load_failed),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.stories_viewer_retry)) }
    }
}

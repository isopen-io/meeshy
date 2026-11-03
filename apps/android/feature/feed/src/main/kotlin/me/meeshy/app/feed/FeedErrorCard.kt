package me.meeshy.app.feed

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La carte d'erreur du fil, en tête de liste sous le composeur (iOS `FeedView`, bloc `viewModel.error`) : une icône,
 * « Impossible de charger le fil », le détail s'il existe, puis « Réessayer ». Une carte dans le flux, pas un écran
 * qui efface le rail de stories ni le composeur : on peut toujours publier.
 */
@Composable
internal fun FeedErrorCard(onRetry: () -> Unit, modifier: Modifier = Modifier, detail: String? = null) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier.semantics(mergeDescendants = true) {},
        ) {
            Icon(
                imageVector = MeeshyIcons.WarningAmberOutlined,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(40.dp),
            )
            Text(
                text = stringResource(R.string.feed_load_error),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                textAlign = TextAlign.Center,
            )
            detail?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        }
        OutlinedButton(onClick = onRetry) { Text(stringResource(R.string.feed_retry)) }
    }
}

package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import me.meeshy.feature.conversations.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Etats sans liste : initial, recherche a froid, aucun resultat (icone + titre + sous-titre fusionnes pour TalkBack). */
@Composable
internal fun SearchStatus(label: String, sublabel: String? = null, showSpinner: Boolean = false) {
    val description = listOfNotNull(label, sublabel).joinToString(". ")
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp, start = MeeshySpacing.xl, end = MeeshySpacing.xl)
            .semantics(mergeDescendants = true) {
                contentDescription = description
                if (showSpinner) liveRegion = LiveRegionMode.Polite
            },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (showSpinner) {
            CircularProgressIndicator(color = MeeshyPalette.Indigo500)
        } else {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(44.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        if (sublabel != null) {
            Text(
                text = sublabel,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

/** Hors ligne et rien a montrer : wifi barre, message de connexion, Reessayer (parite iOS `retryStateView`). */
@Composable
internal fun SearchOfflineState(onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp, start = MeeshySpacing.xl, end = MeeshySpacing.xl)
            .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(
            imageVector = Icons.Filled.WifiOff,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(44.dp),
        )
        Text(
            text = stringResource(R.string.global_search_offline_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.global_search_retry)) }
    }
}

/** Pastille discrete en surimpression : une revalidation tourne par-dessus la liste servie. */
@Composable
internal fun SearchRevalidationPill(modifier: Modifier = Modifier) {
    val label = stringResource(R.string.global_search_searching)
    Row(
        modifier = modifier
            .padding(top = MeeshySpacing.sm)
            .clip(CircleShape)
            .background(MeeshyTheme.tokens.backgroundSecondary)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                liveRegion = LiveRegionMode.Polite
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(12.dp),
            strokeWidth = 1.5.dp,
            color = MeeshyPalette.Indigo500,
        )
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

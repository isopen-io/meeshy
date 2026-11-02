package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.search.SearchLoadState
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Bandeau discret au-dessus des resultats : hors ligne (reponse locale seule) ou volet en
 * panne (la liste reste). La revalidation n'y est PAS : elle est en surimpression.
 */
@Composable
internal fun SearchStateBanner(state: GlobalSearchUiState, onRetry: () -> Unit) {
    val message = when {
        state.loadState == SearchLoadState.OFFLINE -> stringResource(R.string.global_search_offline_banner)
        state.failure != null -> stringResource(R.string.global_search_partial_failure)
        else -> null
    }
    Column(modifier = Modifier.fillMaxWidth()) {
        if (message != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            ) {
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                )
                TextButton(onClick = onRetry) { Text(stringResource(R.string.global_search_retry)) }
            }
        }
    }
}

/** Rien a montrer ET le reseau est tombe : l'ecran dit la panne et propose de reessayer. */
@Composable
internal fun SearchFailureState(onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 60.dp, start = MeeshySpacing.xl, end = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = stringResource(R.string.global_search_failed_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = stringResource(R.string.global_search_failed_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
        )
        TextButton(onClick = onRetry) { Text(stringResource(R.string.global_search_retry)) }
    }
}

package me.meeshy.ui.component

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.HistoryToggleOff
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.ui.R

/**
 * Ecran d'echec d'ouverture d'un contenu : meme silhouette (icone, titre, detail, action) pour
 * disparu / reseau / serveur, memes phrases que iOS `ContentFetchFailure+Copy`. « Reessayer »
 * n'est offert que si [ContentFetchFailure.offersRetry] ET que l'hote fournit [onRetry].
 */
@Composable
public fun ContentFetchFailureView(
    failure: ContentFetchFailure,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    secondaryLabel: String? = null,
    onSecondary: (() -> Unit)? = null,
) {
    val retry = onRetry?.takeIf { failure.offersRetry }
    MeeshyEmptyState(
        icon = when (failure) {
            ContentFetchFailure.NETWORK -> Icons.Filled.WifiOff
            ContentFetchFailure.SERVER -> Icons.Filled.Warning
            ContentFetchFailure.FORBIDDEN, ContentFetchFailure.NOT_FOUND -> Icons.Filled.HistoryToggleOff
        },
        title = stringResource(
            when (failure) {
                ContentFetchFailure.NETWORK -> R.string.content_failure_network_title
                ContentFetchFailure.SERVER -> R.string.content_failure_server_title
                ContentFetchFailure.FORBIDDEN, ContentFetchFailure.NOT_FOUND -> R.string.content_failure_unavailable_title
            },
        ),
        subtitle = stringResource(
            when (failure) {
                ContentFetchFailure.NETWORK -> R.string.content_failure_network_body
                ContentFetchFailure.SERVER -> R.string.content_failure_server_body
                ContentFetchFailure.FORBIDDEN, ContentFetchFailure.NOT_FOUND -> R.string.content_failure_unavailable_body
            },
        ),
        modifier = modifier,
        actionLabel = retry?.let { stringResource(R.string.content_failure_retry) },
        onAction = retry,
        secondaryLabel = secondaryLabel,
        onSecondary = onSecondary,
    )
}

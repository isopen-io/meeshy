package me.meeshy.app.conversations

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.conversationlist.ConversationListPagination
import me.meeshy.sdk.model.conversationlist.PaginationFooter
import me.meeshy.sdk.model.conversationlist.PaginationState
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

internal const val PAGINATION_FOOTER_TAG = "conversation-pagination-footer"
internal const val PAGINATION_SENTINEL_TAG = "conversation-pagination-sentinel"
internal const val PAGINATION_RETRY_TAG = "conversation-pagination-retry"

/** Le créneau du pied de liste : une seule hauteur dans tous les états, pour que rien dessous ne saute (iOS #8759). */
private val FOOTER_SLOT_HEIGHT = 52.dp

/** La sentinelle invisible : 1 dp, elle déclenche le chargement dès qu'elle entre dans la composition. */
private val SENTINEL_HEIGHT = 1.dp

/**
 * Le pied de la liste (iOS `ConversationPaginationFooterContent`) : spinner indigo 400 pendant le chargement,
 * « Toutes les conversations sont chargées » au-delà de 30, message d'erreur + Réessayer, sinon la sentinelle.
 */
@Composable
internal fun ConversationPaginationFooter(
    state: PaginationState,
    hasMore: Boolean,
    conversationCount: Int,
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val footer = ConversationListPagination.footer(state, hasMore, conversationCount)
    Box(
        modifier = modifier.fillMaxWidth().height(FOOTER_SLOT_HEIGHT).testTag(PAGINATION_FOOTER_TAG),
        contentAlignment = Alignment.Center,
    ) {
        when (footer) {
            PaginationFooter.Blank -> Unit
            PaginationFooter.Sentinel -> PaginationSentinel(onLoadMore)
            PaginationFooter.Spinner -> CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                strokeWidth = 2.dp,
                color = MeeshyPalette.Indigo400,
            )
            PaginationFooter.AllLoaded -> Text(
                text = stringResource(R.string.conversations_pagination_allLoaded),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
            PaginationFooter.Failure -> PaginationFailure(onLoadMore)
        }
    }
}

@Composable
private fun PaginationSentinel(onLoadMore: () -> Unit) {
    val latest by rememberUpdatedState(onLoadMore)
    Box(Modifier.fillMaxWidth().height(SENTINEL_HEIGHT).testTag(PAGINATION_SENTINEL_TAG))
    LaunchedEffect(Unit) { latest() }
}

@Composable
private fun PaginationFailure(onRetry: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(
            text = stringResource(R.string.conversations_pagination_errorTitle),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Text(
            text = stringResource(R.string.conversations_pagination_retry),
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Medium),
            color = MeeshyPalette.Indigo400,
            modifier = Modifier
                .heightIn(min = 48.dp)
                .clickable(onClick = onRetry)
                .testTag(PAGINATION_RETRY_TAG),
        )
    }
}

/** Charge la suite quand la dernière ligne visible est à cinq rangs de la fin ou moins (iOS : seuil du défilement). */
@Composable
internal fun ConversationPaginationTrigger(listState: LazyListState, enabled: Boolean, onLoadMore: () -> Unit) {
    val latest by rememberUpdatedState(onLoadMore)
    LaunchedEffect(listState, enabled) {
        if (!enabled) return@LaunchedEffect
        snapshotFlow {
            ConversationListPagination.shouldLoadMore(
                lastVisibleIndex = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1,
                rowCount = listState.layoutInfo.totalItemsCount,
            )
        }.distinctUntilChanged().collect { if (it) latest() }
    }
}

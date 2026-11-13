package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.ui.component.MeeshyEmptyState
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.refresh.MeeshyRefreshableBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'onglet « Appels », embarquable (iOS `CallsTab`) : recherche, pastilles Tous / Manqués / Vidéo,
 * « Tout effacer » confirmé, bannière d'échec, lignes balayables, pagination et tirer-pour-rafraîchir.
 * Un toucher sur une ligne appelle [onOpenDetail] ; le rappel passe par [onRedial] avec le média choisi.
 * [isActive] dit si l'onglet est celui qu'on regarde (le hub n'écoute le défilement que de celui-là) et
 * [onCollapseProgressChange] rend l'avancement 0..1 du repli de son en-tête, calculé sur le défilement.
 */
@Composable
fun CallsTab(
    onOpenDetail: (CallRecord) -> Unit,
    onRedial: (record: CallRecord, isVideo: Boolean) -> Unit,
    modifier: Modifier = Modifier,
    isActive: Boolean = true,
    onCollapseProgressChange: (Float) -> Unit = {},
    viewModel: CallHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmsClearAll by remember { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
    val listState = rememberLazyListState()

    LaunchedEffect(isActive, listState) {
        if (!isActive) return@LaunchedEffect
        snapshotFlow {
            if (listState.firstVisibleItemIndex > 0) {
                1f
            } else {
                (listState.firstVisibleItemScrollOffset / COLLAPSE_DISTANCE_PX).coerceIn(0f, 1f)
            }
        }.distinctUntilChanged().collect(onCollapseProgressChange)
    }

    Column(modifier.fillMaxSize()) {
        CallHistorySearchField(
            query = state.searchQuery,
            onChange = viewModel::setSearchQuery,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        CallHistoryFilterRow(
            missedOnly = state.missedOnly,
            videoOnly = state.videoOnly,
            canClear = state.records.isNotEmpty(),
            onMissed = viewModel::setMissedOnly,
            onVideo = viewModel::setVideoOnly,
            onClearAll = { confirmsClearAll = true },
        )
        CallHistoryEraseFailedBanner(visible = state.eraseFailed, onDismiss = viewModel::dismissEraseFailure)
        CallJournalBody(
            state = state,
            listState = listState,
            onOpenDetail = onOpenDetail,
            onRedial = onRedial,
            onHide = { callId ->
                haptics.medium()
                viewModel.hide(callId)
            },
            onRefresh = {
                viewModel.refresh()
                viewModel.state.first { !it.isUserRefreshing }
            },
            onLoadMoreIfNeeded = viewModel::loadMoreIfNeeded,
            onLoadMore = viewModel::loadMore,
            onRetry = viewModel::retry,
        )
    }

    if (confirmsClearAll) {
        CallHistoryClearAllDialog(
            onConfirm = {
                confirmsClearAll = false
                haptics.medium()
                viewModel.clearAll()
            },
            onDismiss = { confirmsClearAll = false },
        )
    }
}

/** Le corps du journal : squelette à froid, erreur, vide, ou la liste paginée et rafraîchissable. */
@Composable
internal fun CallJournalBody(
    state: CallHistoryUiState,
    listState: LazyListState,
    onOpenDetail: (CallRecord) -> Unit,
    onRedial: (record: CallRecord, isVideo: Boolean) -> Unit,
    onHide: (callId: String) -> Unit,
    onRefresh: suspend () -> Unit,
    onLoadMoreIfNeeded: (callId: String) -> Unit,
    onLoadMore: () -> Unit,
    onRetry: () -> Unit,
) {
    Box(Modifier.fillMaxSize()) {
        when (CallHistoryContent.of(state)) {
            CallHistoryContent.SKELETON -> CallHistorySkeleton()
            CallHistoryContent.ERROR -> CallHistoryError(onRetry = onRetry)
            CallHistoryContent.EMPTY -> CallHistoryEmpty(state)
            CallHistoryContent.LIST -> MeeshyRefreshableBox(onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize(), state = listState) {
                    items(state.records, key = { it.callId }, contentType = { "call" }) { record ->
                        CallHistoryRow(
                            record = record,
                            onOpen = { onOpenDetail(record) },
                            onRedial = { video -> onRedial(record, video) },
                            onHide = { onHide(record.callId) },
                            modifier = Modifier.animateItem(),
                        )
                        onLoadMoreIfNeeded(record.callId)
                    }
                    if (state.hasMore) {
                        item(key = FOOTER_KEY, contentType = "footer") {
                            CallHistoryFooter(
                                failed = state.errorMessage != null,
                                onLoad = onLoadMore,
                                onRetry = onRetry,
                            )
                        }
                    }
                }
            }
        }
    }
}


@Composable
private fun CallHistorySkeleton() {
    Column(Modifier.fillMaxSize().padding(MeeshySpacing.lg)) {
        repeat(SKELETON_ROWS) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MeeshySkeletonBox(Modifier.size(48.dp))
                Spacer(Modifier.width(MeeshySpacing.md))
                Column(Modifier.weight(1f)) {
                    MeeshySkeletonBox(Modifier.fillMaxWidth(0.5f).height(16.dp))
                    Spacer(Modifier.height(MeeshySpacing.xs))
                    MeeshySkeletonBox(Modifier.fillMaxWidth(0.3f).height(12.dp))
                }
            }
        }
    }
}

@Composable
private fun CallHistoryEmpty(state: CallHistoryUiState) {
    when (CallHistoryEmptyKind.of(state)) {
        CallHistoryEmptyKind.NO_RESULTS -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CallHistorySearchEmpty(query = state.searchQuery)
        }
        CallHistoryEmptyKind.NO_MISSED_CALLS -> MeeshyEmptyState(
            icon = MeeshyIcons.CallEnd,
            title = stringResource(R.string.call_history_empty_missed),
            subtitle = "",
            accent = MeeshyPalette.Error,
        )
        CallHistoryEmptyKind.NO_CALLS -> MeeshyEmptyState(
            icon = MeeshyIcons.Call,
            title = stringResource(R.string.call_journal_empty_title),
            subtitle = "",
        )
    }
}

@Composable
private fun CallHistoryError(onRetry: () -> Unit) {
    MeeshyEmptyState(
        icon = MeeshyIcons.WifiOff,
        title = stringResource(R.string.call_history_error),
        subtitle = "",
        accent = MeeshyPalette.Error,
        actionLabel = stringResource(R.string.call_history_retry),
        onAction = onRetry,
    )
}

/** Bottom of the list: loads the next older page on arrival, or offers to retry it. */
@Composable
private fun CallHistoryFooter(failed: Boolean, onLoad: () -> Unit, onRetry: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        if (failed) {
            TextButton(onClick = onRetry) { Text(stringResource(R.string.call_history_retry)) }
        } else {
            val loading = stringResource(R.string.call_history_loading_more)
            LaunchedEffect(Unit) { onLoad() }
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp).semantics { contentDescription = loading },
                strokeWidth = 2.dp,
            )
        }
    }
}

private const val FOOTER_KEY = "call-history-footer"
private const val SKELETON_ROWS = 8

private const val COLLAPSE_DISTANCE_PX = 160f

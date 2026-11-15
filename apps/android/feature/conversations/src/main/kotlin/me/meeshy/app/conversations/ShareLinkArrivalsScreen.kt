package me.meeshy.app.conversations

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ShareLinkArrivalsListState
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyCard
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Toutes les arrivées d'un lien, au-delà des récentes — Liens › le lien › « Voir les N arrivées »
 * (iOS `ShareLinkArrivalsListView`). Cache-first : peinte des récentes de la fiche, le squelette n'apparaît
 * que s'il n'y a RIEN à montrer. Un échec de page ne retire rien : il se dit en pied de liste.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareLinkArrivalsScreen(
    onBack: () -> Unit,
    viewModel: ShareLinkArrivalsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptic = LocalHapticFeedback.current
    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.shareLink_detail_arrivals)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(MeeshyIcons.Back, contentDescription = stringResource(R.string.my_share_links_back))
                        }
                    },
                )
            },
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = state.isLoadingFirstPage && state.arrivals.isNotEmpty(),
                onRefresh = viewModel::loadFirstPage,
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                ArrivalsList(state, viewModel, onRetry = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    viewModel.retry()
                })
            }
        }
    }
}

@Composable
private fun ArrivalsList(state: ShareLinkArrivalsListState, viewModel: ShareLinkArrivalsViewModel, onRetry: () -> Unit) {
    val listState = rememberLazyListState()
    val headerCount = if (state.totalCount > 0) 1 else 0
    LaunchedEffect(listState, headerCount) {
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index }
            .collect { last -> if (last != null) viewModel.onRowShown(last - headerCount) }
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = MeeshySpacing.lg, end = MeeshySpacing.lg, top = MeeshySpacing.lg, bottom = 60.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        if (state.totalCount > 0) {
            item(key = "total") {
                Text(
                    pluralStringResource(R.plurals.shareLink_arrivals_total, state.totalCount, state.totalCount),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.xs),
                )
            }
        }
        when {
            state.showsSkeleton -> item(key = "skeleton") {
                MeeshyCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                        repeat(SKELETON_ROWS) { ShareLinkArrivalSkeletonRow() }
                    }
                }
            }
            state.showsFullError -> item(key = "error") { FullError(onRetry) }
            state.showsEmpty -> item(key = "empty") {
                MeeshyCard(Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.shareLink_detail_noArrivals), color = MeeshyTheme.tokens.textSecondary)
                }
            }
            else -> {
                itemsIndexed(state.arrivals, key = { _, entry -> entry.key }) { _, entry ->
                    MeeshyCard(Modifier.fillMaxWidth().animateItem()) { ShareLinkArrivalRow(entry) }
                }
                item(key = "footer") { Footer(state, onRetry) }
            }
        }
    }
}

@Composable
private fun Footer(state: ShareLinkArrivalsListState, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().animateContentSize(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        if (state.isLoadingNextPage) {
            repeat(2) { ShareLinkArrivalSkeletonRow() }
        } else if (state.showsFooterError) {
            Text(
                stringResource(if (state.nextPageFailed) R.string.shareLink_arrivals_moreFailed else R.string.shareLink_arrivals_loadFailed),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
            RetryButton(onRetry)
        }
    }
}

@Composable
private fun FullError(onRetry: () -> Unit) {
    MeeshyCard(Modifier.fillMaxWidth()) {
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
        ) {
            Icon(MeeshyIcons.WifiProblem, contentDescription = null, tint = MeeshyPalette.Indigo400)
            Text(
                stringResource(R.string.shareLink_arrivals_loadFailed),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
                color = MeeshyTheme.tokens.textPrimary,
            )
            RetryButton(onRetry)
        }
    }
}

@Composable
private fun RetryButton(onRetry: () -> Unit) {
    TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
        Text(stringResource(R.string.common_retry), fontWeight = FontWeight.Bold, color = MeeshyPalette.Indigo400)
    }
}

private const val SKELETON_ROWS = 6

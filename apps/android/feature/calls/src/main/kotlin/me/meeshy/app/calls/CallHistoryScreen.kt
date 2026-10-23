package me.meeshy.app.calls

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The recent/missed-calls list — pure glue over [CallHistoryViewModel]. Cache-first
 * rows paint immediately; the skeleton shows only on a cold empty cache; a failed
 * load says so (with « Réessayer ») instead of claiming the journal is empty. A tap
 * opens the call's detail; calling back goes through [onRedial] with the media the
 * user picked. The list footer loads older pages and offers a retry when one fails.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallHistoryScreen(
    onRedial: (record: CallRecord, isVideo: Boolean) -> Unit,
    viewModel: CallHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var detail by remember { mutableStateOf<CallRecord?>(null) }

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = Color.Transparent,
                    titleContentColor = MeeshyTheme.tokens.textPrimary,
                ),
                title = { Text(stringResource(R.string.call_history_title)) },
                actions = {
                    CallHistoryFilters(
                        missedOnly = state.missedOnly,
                        onSelect = viewModel::setMissedOnly,
                    )
                    Spacer(Modifier.width(MeeshySpacing.sm))
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (CallHistoryContent.of(state)) {
                CallHistoryContent.SKELETON -> CallHistorySkeleton()
                CallHistoryContent.ERROR -> CallHistoryError(onRetry = viewModel::retry)
                CallHistoryContent.EMPTY -> CallHistoryEmpty(missedOnly = state.missedOnly)
                CallHistoryContent.LIST -> PullToRefreshBox(
                    isRefreshing = state.isUserRefreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(Modifier.fillMaxSize()) {
                        items(state.records, key = { it.callId }) { record ->
                            CallHistoryRow(
                                record = record,
                                onOpen = { detail = record },
                                onRedial = { video -> onRedial(record, video) },
                            )
                            viewModel.loadMoreIfNeeded(record.callId)
                        }
                        if (state.hasMore) {
                            item(key = FOOTER_KEY) {
                                CallHistoryFooter(
                                    failed = state.errorMessage != null,
                                    onLoad = viewModel::loadMore,
                                    onRetry = viewModel::retry,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
    }

    detail?.let { record ->
        CallDetailSheet(
            record = record,
            onRedial = { video ->
                detail = null
                onRedial(record, video)
            },
            onDismiss = { detail = null },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CallHistoryFilters(missedOnly: Boolean, onSelect: (Boolean) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        FilterChip(
            selected = !missedOnly,
            onClick = { onSelect(false) },
            label = { Text(stringResource(R.string.call_history_filter_all)) },
        )
        FilterChip(
            selected = missedOnly,
            onClick = { onSelect(true) },
            label = { Text(stringResource(R.string.call_history_filter_missed)) },
        )
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
private fun CallHistoryEmpty(missedOnly: Boolean) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = stringResource(
                if (missedOnly) R.string.call_history_empty_missed else R.string.call_history_empty,
            ),
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun CallHistoryError(onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(MeeshySpacing.xl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.call_history_error),
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textSecondary,
        )
        Spacer(Modifier.height(MeeshySpacing.md))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.call_history_retry)) }
    }
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

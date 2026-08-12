package me.meeshy.app.calls

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.CallMade
import androidx.compose.material.icons.automirrored.filled.CallReceived
import androidx.compose.material.icons.automirrored.filled.CallMissed
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallDirection
import me.meeshy.sdk.model.call.CallRecord
import androidx.compose.material3.TopAppBarDefaults
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * The recent/missed-calls list — pure glue over [CallHistoryViewModel]. Cache-first
 * rows paint immediately; the skeleton shows only on a cold empty cache; pull-to-
 * refresh and infinite scroll are wired to the ViewModel intents. The accent per
 * row is derived from the peer identity for colour coherence.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CallHistoryScreen(
    onOpenCall: (CallRecord) -> Unit,
    viewModel: CallHistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

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
            when {
                state.showSkeleton -> CallHistorySkeleton()
                state.records.isEmpty() -> CallHistoryEmpty(missedOnly = state.missedOnly)
                else -> PullToRefreshBox(
                    isRefreshing = state.isUserRefreshing,
                    onRefresh = viewModel::refresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    LazyColumn(Modifier.fillMaxSize()) {
                        items(state.records, key = { it.callId }) { record ->
                            CallHistoryRow(
                                record = record,
                                onClick = { onOpenCall(record) },
                            )
                            viewModel.loadMoreIfNeeded(record.callId)
                        }
                    }
                }
            }
        }
    }
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
private fun CallHistoryRow(record: CallRecord, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(name = record.displayName, size = 48.dp)
        Spacer(Modifier.width(MeeshySpacing.md))
        Column(Modifier.weight(1f)) {
            Text(
                text = record.displayName,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = record.nameColor(),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                DirectionIcon(record.directionKind)
                Spacer(Modifier.width(MeeshySpacing.xs))
                Text(
                    text = record.subtitle(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            }
        }
        Text(
            text = CallTimeLabel.label(
                startedAtIso = record.startedAt,
                nowMillis = System.currentTimeMillis(),
                zone = ZoneId.systemDefault(),
                locale = Locale.getDefault(),
                yesterday = stringResource(R.string.call_history_yesterday),
            ),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun DirectionIcon(direction: CallDirection) {
    val (icon, descRes, tint) = when (direction) {
        CallDirection.INCOMING -> Triple(
            Icons.AutoMirrored.Filled.CallReceived,
            R.string.call_history_incoming,
            MeeshyTheme.tokens.textSecondary,
        )
        CallDirection.OUTGOING -> Triple(
            Icons.AutoMirrored.Filled.CallMade,
            R.string.call_history_outgoing,
            MeeshyTheme.tokens.textSecondary,
        )
        CallDirection.MISSED -> Triple(
            Icons.AutoMirrored.Filled.CallMissed,
            R.string.call_history_missed,
            MeeshyPalette.Error,
        )
    }
    Icon(
        imageVector = icon,
        contentDescription = stringResource(descRes),
        tint = tint,
        modifier = Modifier.size(16.dp),
    )
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
private fun CallRecord.nameColor(): Color =
    if (isMissed) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary

/** Duration and data volume, `·`-separated; empty for a zero-duration missed call. */
private fun CallRecord.subtitle(): String =
    listOfNotNull(durationLabel.ifBlank { null }, dataLabel).joinToString(" · ")

private const val SKELETON_ROWS = 8

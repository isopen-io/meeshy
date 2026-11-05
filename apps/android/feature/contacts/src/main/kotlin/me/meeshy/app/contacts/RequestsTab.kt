package me.meeshy.app.contacts

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import me.meeshy.feature.contacts.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.component.ConnectionFeedbackHost
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** L'onglet « Demandes » du carnet : deux pastilles Reçues / Envoyées et la liste de la direction choisie. */
@Composable
fun RequestsTab(
    onOpenProfile: (userId: String) -> Unit,
    viewModel: RequestsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    Box(modifier = Modifier.fillMaxSize()) {
        RequestsContent(
            state = state,
            onSelect = {
                haptics.light()
                viewModel.selectDirection(it)
            },
            onAccept = viewModel::accept,
            onDecline = viewModel::decline,
            onCancel = viewModel::cancel,
            onRefresh = viewModel::refresh,
            onLoadMore = viewModel::loadMore,
            onOpenProfile = onOpenProfile,
        )
        ConnectionFeedbackHost(feedback = viewModel.feedback)
    }
}

@Composable
internal fun RequestsContent(
    state: RequestsUiState,
    onSelect: (RequestsDirection) -> Unit,
    onAccept: (String) -> Unit,
    onDecline: (String) -> Unit,
    onCancel: (String) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: (RequestsDirection) -> Unit,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
    onScrollOffsetDp: (Float) -> Unit = {},
) {
    Column(modifier = modifier.fillMaxSize()) {
        DirectionPills(
            selected = state.direction,
            receivedCount = state.received.rows.size,
            sentCount = state.sent.rows.size,
            onSelect = onSelect,
        )
        if (state.showSkeleton) {
            RequestsSkeleton()
        } else {
            DirectionList(
                state = state,
                onAccept = onAccept,
                onDecline = onDecline,
                onCancel = onCancel,
                onRefresh = onRefresh,
                onLoadMore = onLoadMore,
                onOpenProfile = onOpenProfile,
                onScrollOffsetDp = onScrollOffsetDp,
            )
        }
    }
}

@Composable
private fun DirectionPills(
    selected: RequestsDirection,
    receivedCount: Int,
    sentCount: Int,
    onSelect: (RequestsDirection) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DirectionPill(
            label = stringResource(R.string.contacts_requests_filter_received, receivedCount),
            isSelected = selected == RequestsDirection.Received,
            onClick = { onSelect(RequestsDirection.Received) },
        )
        DirectionPill(
            label = stringResource(R.string.contacts_requests_filter_sent, sentCount),
            isSelected = selected == RequestsDirection.Sent,
            onClick = { onSelect(RequestsDirection.Sent) },
        )
    }
}

@Composable
private fun DirectionPill(label: String, isSelected: Boolean, onClick: () -> Unit) {
    val reduceMotion = LocalReduceMotion.current
    val scale by animateFloatAsState(
        targetValue = if (isSelected) 1f else 0.96f,
        animationSpec = if (reduceMotion) spring(stiffness = Spring.StiffnessHigh) else spring(dampingRatio = Spring.DampingRatioMediumBouncy),
        label = "requests-pill-scale",
    )
    val shape = CircleShape
    Text(
        text = label,
        style = MaterialTheme.typography.labelLarge,
        color = if (isSelected) MeeshyPalette.White else MeeshyTheme.tokens.textSecondary,
        modifier = Modifier
            .scale(scale)
            .heightIn(min = 48.dp)
            .clip(shape)
            .background(if (isSelected) MeeshyPalette.Indigo500 else MeeshyPalette.Indigo500.copy(alpha = 0f))
            .border(1.dp, if (isSelected) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.3f), shape)
            .clickable(role = Role.Tab, onClick = onClick)
            .semantics { this.selected = isSelected }
            .padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DirectionList(
    state: RequestsUiState,
    onAccept: (String) -> Unit,
    onDecline: (String) -> Unit,
    onCancel: (String) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: (RequestsDirection) -> Unit,
    onOpenProfile: (String) -> Unit,
    onScrollOffsetDp: (Float) -> Unit,
) {
    val direction = state.direction
    val list = state.selected
    PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        if (list.rows.isEmpty()) {
            LaunchedEffect(direction) { onScrollOffsetDp(0f) }
            RequestsEmpty(direction = direction, error = list.shownError)
            return@PullToRefreshBox
        }
        key(direction) {
        val listState = rememberLazyListState()
        val density = LocalDensity.current
        LaunchedEffect(listState, density) {
            snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }
                .collect { (index, offset) ->
                    onScrollOffsetDp(if (index > 0) -SCROLLED_PAST_FIRST_DP else -with(density) { offset.toDp().value })
                }
        }
        LaunchedEffect(direction, list.rows.size, list.hasMore) {
            snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1 }
                .distinctUntilChanged()
                .filter { it >= list.rows.lastIndex }
                .collect { onLoadMore(direction) }
        }
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            items(list.rows, key = { "${direction.name}-${it.id}" }, contentType = { direction }) { request ->
                if (direction == RequestsDirection.Received) {
                    ReceivedRequestRow(
                        request = request,
                        onAccept = { onAccept(request.id) },
                        onDecline = { onDecline(request.id) },
                        onOpenProfile = { onOpenProfile(request.senderId) },
                        modifier = Modifier.animateItem(),
                    )
                } else {
                    SentRequestRow(
                        request = request,
                        onCancel = { onCancel(request.id) },
                        onOpenProfile = { onOpenProfile(request.receiverId) },
                        modifier = Modifier.animateItem(),
                    )
                }
            }
        }
        }
    }
}

@Composable
private fun RequestsEmpty(direction: RequestsDirection, error: String?) {
    val received = direction == RequestsDirection.Received
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = Icons.Filled.Person,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = stringResource(if (received) R.string.contacts_requests_empty_received else R.string.contacts_requests_empty_sent),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 12.dp),
        )
        Text(
            text = error ?: stringResource(
                if (received) R.string.contacts_requests_empty_received_subtitle else R.string.contacts_requests_empty_sent_subtitle,
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = if (error != null) MeeshyPalette.Error else MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun RequestsSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        repeat(SKELETON_ROWS) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                MeeshySkeletonBox(modifier = Modifier.size(44.dp), shape = CircleShape)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    MeeshySkeletonBox(modifier = Modifier.size(width = 140.dp, height = 14.dp))
                    MeeshySkeletonBox(modifier = Modifier.size(width = 200.dp, height = 12.dp))
                }
            }
        }
    }
}

private const val SKELETON_ROWS = 5
private const val SCROLLED_PAST_FIRST_DP = 200f

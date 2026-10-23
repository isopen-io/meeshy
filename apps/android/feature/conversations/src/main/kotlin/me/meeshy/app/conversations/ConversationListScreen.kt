package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.chrome.CollapsibleHeaderDefaults
import me.meeshy.ui.component.chrome.CollapsibleHeaderMotion
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.ScrollMotionVisibility

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    onConversationClick: (String) -> Unit,
    onLogout: () -> Unit,
    onNewConversation: () -> Unit = {},
    onOpenShareLinkPicker: () -> Unit = {},
    onDashboard: () -> Unit = {},
    onGlobalSearch: () -> Unit = {},
    viewModel: ConversationListViewModel = hiltViewModel(),
    header: @Composable () -> Unit = {},
    onRefresh: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    // A tap resolves to navigation only through the ViewModel's one-shot gate: an
    // unlocked row emits immediately; a locked row emits after its PIN sheet accepts
    // the code. Collecting the event (not reading state) keeps a config-change replay
    // from re-navigating.
    LaunchedEffect(viewModel) {
        viewModel.openConversation.collect { onConversationClick(it) }
    }

    val density = LocalDensity.current
    val collapseThresholdPx = remember(density) {
        with(density) { CollapsibleHeaderDefaults.CollapseThreshold.roundToPx() }
    }
    val headerScrollProgress = CollapsibleHeaderMotion.collapseProgress(
        firstVisibleItemIndex = listState.firstVisibleItemIndex,
        firstVisibleItemScrollOffsetPx = listState.firstVisibleItemScrollOffset,
        thresholdPx = collapseThresholdPx,
    )
    var headerQuietMillis by remember { mutableLongStateOf(ScrollMotionVisibility.STILLNESS_THRESHOLD_MS) }
    LaunchedEffect(listState.isScrollInProgress) {
        if (listState.isScrollInProgress) {
            headerQuietMillis = 0L
        } else {
            val start = System.currentTimeMillis()
            while (isActive && headerQuietMillis < ScrollMotionVisibility.STILLNESS_THRESHOLD_MS) {
                headerQuietMillis = System.currentTimeMillis() - start
                delay(16)
            }
        }
    }
    val headerActionsVisible = ScrollMotionVisibility.isVisible(listState.isScrollInProgress, headerQuietMillis)

    val searchBarDirectionThresholdPx = remember(density) { with(density) { 8.dp.roundToPx() } }
    var isScrollingDown by remember { mutableStateOf(false) }
    LaunchedEffect(listState, searchBarDirectionThresholdPx) {
        var previousScrollPosition = ConversationScrollPosition(
            listState.firstVisibleItemIndex,
            listState.firstVisibleItemScrollOffset,
        )
        snapshotFlow {
            ConversationScrollPosition(listState.firstVisibleItemIndex, listState.firstVisibleItemScrollOffset)
        }.collect { currentScrollPosition ->
            ConversationSearchBarVisibility.scrollDirectionDown(
                previous = previousScrollPosition,
                current = currentScrollPosition,
                thresholdPx = searchBarDirectionThresholdPx,
            )?.let { isScrollingDown = it }
            previousScrollPosition = currentScrollPosition
        }
    }
    var isSearchFocused by remember { mutableStateOf(false) }
    val searchBarVisible = ConversationSearchBarVisibility.isVisible(
        hasQuery = state.searchText.isNotBlank(),
        isFocused = isSearchFocused,
        isScrollingDown = isScrollingDown,
    )

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            ConversationListHeader(
                state = state,
                scrollProgress = headerScrollProgress,
                actionsVisible = headerActionsVisible,
                onUnlockAll = viewModel::onUnlockAll,
                onChangeMasterPin = viewModel::onChangeMasterPin,
                onRemoveMasterPin = viewModel::onRemoveMasterPin,
                onOpenShareLinkPicker = onOpenShareLinkPicker,
                onNewConversation = onNewConversation,
            )
        },
        bottomBar = {
            AnimatedVisibility(visible = searchBarVisible) {
                ConversationSearchBar(
                    query = state.searchText,
                    onQueryChange = viewModel::setSearch,
                    onFocusChange = { isSearchFocused = it },
                    onDashboard = onDashboard,
                    onGlobalSearch = onGlobalSearch,
                )
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            ConnectionBannerStrip(state.banner)
            header()
            ConversationFilterBar(selected = state.selectedFilter, onSelect = viewModel::selectFilter)
            Box(modifier = Modifier.weight(1f)) {
                ConversationListStateHost(
                    content = ConversationListContent.of(state),
                    onRetry = viewModel::refresh,
                    onNewConversation = onNewConversation,
                ) {
                    ConversationListBody(state = state, listState = listState, viewModel = viewModel, onRefresh = onRefresh)
                }
            }
        }
    }
    state.lockPrompt?.let { prompt ->
        val name = state.conversations.firstOrNull { it.id == prompt.conversationId }
            ?.displayTitle(state.currentUserId).orEmpty()
        ConversationLockPinSheet(
            prompt = prompt,
            conversationName = name,
            onDigit = viewModel::onLockDigit,
            onDelete = viewModel::onLockDelete,
            onDismiss = viewModel::dismissLockPrompt,
        )
    }
    }
}

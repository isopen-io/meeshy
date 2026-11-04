package me.meeshy.app.conversations

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
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import me.meeshy.sdk.model.story.PinnedBandReveal
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.sdk.model.conversationlist.ConversationSearchBarScrollLaw
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
    pinnedBand: (@Composable (reveal: Float) -> Unit)? = null,
    searchSyncPill: @Composable () -> Unit = {},
    searchCommunitiesBand: @Composable () -> Unit = {},
    searchCommunityCount: Int = 0,
    onRefresh: () -> Unit = {},
    rowNavigation: ConversationRowNavigation = ConversationRowNavigation.None,
    onOpenSettings: () -> Unit = {},
    onOpenConversationSearch: (String) -> Unit = {},
    onOpenMessage: (conversationId: String, messageId: String) -> Unit = { conversationId, _ -> onConversationClick(conversationId) },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val messageSearch by viewModel.messageSearch.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    // A tap resolves to navigation only through the ViewModel's one-shot gate: an
    // unlocked row emits immediately; a locked row emits after its PIN sheet accepts
    // the code. Collecting the event (not reading state) keeps a config-change replay
    // from re-navigating.
    LaunchedEffect(viewModel) {
        viewModel.openConversation.collect { onConversationClick(it) }
    }
    val avatarNavigation by rememberUpdatedState(rowNavigation)
    LaunchedEffect(viewModel) {
        viewModel.avatarEffects.collect { effect -> avatarNavigation.open(effect, viewModel::conversationFor) }
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

    val searchFocusRequester = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    var searchFocused by remember { mutableStateOf(false) }
    var searchLaw by remember { mutableStateOf(ConversationSearchBarScrollLaw.State.Initial) }
    val searchTyping = ConversationSearchBarVisibility.isTyping(searchFocused, state.searchText)
    val searchTypingNow by rememberUpdatedState(searchTyping)
    val searchBarVisible = ConversationSearchBarVisibility.isVisible(searchLaw, searchFocused, state.searchText)
    val searchScrollConnection = remember(listState, density) {
        var depthPx = 0f
        object : NestedScrollConnection {
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                depthPx = if (listState.canScrollBackward) (depthPx - consumed.y).coerceAtLeast(0f) else 0f
                val previous = searchLaw
                val depthDp = with(density) { depthPx.toDp().value }
                searchLaw = ConversationSearchBarScrollLaw.advance(previous, depthDp, searchTypingNow)
                if (ConversationSearchBarScrollLaw.dropsFocus(previous, searchLaw)) focusManager.clearFocus()
                return Offset.Zero
            }

            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                if (source == NestedScrollSource.Drag && searchFocused && available.y != 0f) {
                    focusManager.clearFocus()
                }
                return Offset.Zero
            }
        }
    }

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
                scrollOffsetDp = pinnedBand?.let { PinnedBandReveal.scrollOffsetDp(listState.firstVisibleItemIndex, with(density) { listState.firstVisibleItemScrollOffset.toDp().value }) },
                pinnedBand = pinnedBand,
            )
        },
        bottomBar = {
            ConversationSearchDock(
                visible = searchBarVisible,
                isFocused = searchFocused,
                query = state.searchText,
                communityCount = searchCommunityCount,
                syncPill = searchSyncPill,
                communitiesBand = searchCommunitiesBand,
            ) {
                ConversationSearchBar(
                    query = state.searchText,
                    onQueryChange = viewModel::setSearch,
                    isFocused = searchFocused,
                    focusRequester = searchFocusRequester,
                    onFocusChanged = { searchFocused = it },
                    onToggleFocus = {
                        if (searchFocused) focusManager.clearFocus() else searchFocusRequester.requestFocus()
                    },
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
            val content = ConversationListContent.of(state, messageSectionShown = messageSearch.showsSection)
            // iOS : le rail puis les filtres sont les premières lignes de la liste, dans tous les états (#13664).
            Box(modifier = Modifier.weight(1f).nestedScroll(searchScrollConnection)) {
                ConversationListBody(
                    state = state,
                    listState = listState,
                    viewModel = viewModel,
                    content = content,
                    onNewConversation = onNewConversation,
                    onRefresh = onRefresh,
                    rowNavigation = rowNavigation,
                    messageSearch = messageSearch,
                    // #14670 — le clavier de la recherche ne suit pas l'utilisateur dans la conversation ouverte.
                    onOpenMessage = { hit ->
                        focusManager.clearFocus()
                        onOpenMessage(hit.conversationId, hit.messageId)
                    },
                    header = {
                        ConversationListHead(
                            rail = header,
                            filters = { ConversationFilterBar(selected = state.selectedFilters, onToggle = viewModel::toggleFilter) },
                        )
                    },
                )
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
    ConversationListDialogHost(viewModel.dialogs, rowNavigation, onOpenSettings, onOpenConversationSearch)
    }
}

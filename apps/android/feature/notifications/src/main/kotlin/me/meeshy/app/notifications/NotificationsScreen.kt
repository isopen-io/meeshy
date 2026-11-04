package me.meeshy.app.notifications

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalDensity
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.sdk.model.NotificationListPane
import me.meeshy.sdk.model.NotificationListStateReducer
import me.meeshy.sdk.model.chrome.CollapsibleHeaderMetrics
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.story.StoryNotificationContext
import me.meeshy.sdk.model.game.GameTarget
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.refresh.MeeshyRefreshableBox
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshySpacing

private const val PREFETCH_DISTANCE = 4
private const val LIST_ANIMATION_MS = 250

/**
 * @param onOpenConversation Navigate to a conversation ([NotificationDestination.Conversation]) — also
 *   where the « Écrire » quick action lands.
 * @param onOpenPost Navigate to a post/story/status detail ([NotificationDestination.Post]).
 * @param onOpenReel Navigate to a réel, anchored at its id ([NotificationDestination.Reel]).
 * @param onOpenStory Navigate to a user's story tray ([NotificationDestination.Story]).
 * @param onOpenProfile Navigate to a user's profile ([NotificationDestination.Profile]).
 * @param onOpenGame Navigate to the game screen a level/streak/badge/duo/league notice names ([NotificationDestination.Game]).
 *
 * Every parameter defaults to a no-op so existing callers keep compiling; wiring them is what
 * makes a row tap actually open its target (issue #4793).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
    onOpenConversation: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenReel: (String) -> Unit = {},
    onOpenStory: (String) -> Unit = {},
    onOpenMood: (String) -> Unit = onOpenPost,
    onOpenProfile: (String) -> Unit = {},
    onOpenGame: (GameTarget) -> Unit = {},
    onOpenStoryContent: ((NotificationDestination.StoryContent, StoryNotificationContext) -> Unit)? = null,
    revealTap: EngagementRevealTapViewModel = hiltViewModel(),
    toasts: NotificationFeedbackToasts = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val openConversation by rememberUpdatedState(onOpenConversation)
    val openPost by rememberUpdatedState(onOpenPost)
    val openReel by rememberUpdatedState(onOpenReel)
    val openStory by rememberUpdatedState(onOpenStory)
    val openMood by rememberUpdatedState(onOpenMood)
    val openProfile by rememberUpdatedState(onOpenProfile)
    val openGame by rememberUpdatedState(onOpenGame)
    val openStoryContent by rememberUpdatedState(onOpenStoryContent)

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is NotificationsEvent.ActionFailed -> {
                    haptics.error()
                    toasts.failure(context.getString(event.message))
                }
                is NotificationsEvent.OpenConversation -> openConversation(event.conversationId)
            }
        }
    }
    val onOpen = remember(viewModel, revealTap, haptics) {
        { notification: ApiNotification ->
            haptics.light()
            viewModel.markAsRead(notification.id)
            revealTap.onOpened(notification)
            NotificationDestinationResolver.resolve(notification).dispatch(
                onOpenConversation = { openConversation(it) },
                onOpenPost = { openPost(it) },
                onOpenReel = { openReel(it) },
                onOpenStory = { openStory(it) },
                onOpenProfile = { openProfile(it) },
                onOpenMood = { openMood(it) },
                onOpenGame = { openGame(it) },
                onOpenStoryContent = { target ->
                    openStoryContent?.invoke(target, StoryNotificationContext.from(notification, System.currentTimeMillis()))
                        ?: openPost(target.postId)
                },
            )
        }
    }
    val onMarkRead = remember(viewModel, haptics) {
        { notification: ApiNotification ->
            haptics.light()
            viewModel.markAsRead(notification.id)
        }
    }
    val onDelete = remember(viewModel, haptics) {
        { notification: ApiNotification ->
            haptics.medium()
            viewModel.deleteNotification(notification.id)
        }
    }
    val onQuickAction = remember(viewModel, haptics) {
        { notification: ApiNotification, action: NotificationQuickAction ->
            haptics.light()
            viewModel.performQuickAction(notification, action)
        }
    }
    val onSelectCategory = remember(viewModel, haptics) {
        { category: me.meeshy.sdk.model.NotificationFilterCategory ->
            haptics.light()
            viewModel.selectCategory(category)
        }
    }
    val onMarkAllRead = remember(viewModel, haptics) {
        {
            haptics.light()
            viewModel.markAllRead()
        }
    }
    val onRetry = remember(viewModel) { viewModel::load }
    val listState = rememberLazyListState()
    val density = LocalDensity.current.density
    val scrollOffsetDp by remember(listState, density) {
        derivedStateOf {
            if (listState.firstVisibleItemIndex > 0) -CollapsibleHeaderMetrics.COLLAPSE_THRESHOLD
            else -listState.firstVisibleItemScrollOffset / density
        }
    }

    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
        ) { padding ->
            Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                NotificationListHeader(
                    scrollOffsetDp = scrollOffsetDp,
                    unreadCount = state.unreadCount,
                    onBack = onBack,
                    onMarkAllRead = onMarkAllRead,
                )
                NotificationCategoryBar(selected = state.selectedCategory, onSelect = onSelectCategory)
                MeeshyRefreshableBox(
                    onRefresh = viewModel::pullRefresh,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    NotificationPanes(
                        state = state,
                        listState = listState,
                        onOpen = onOpen,
                        onMarkRead = onMarkRead,
                        onDelete = onDelete,
                        onQuickAction = onQuickAction,
                        onRetry = onRetry,
                        onLoadMore = viewModel::loadMore,
                    )
                }
            }
        }
    }
}

@Composable
private fun NotificationPanes(
    state: NotificationsUiState,
    onOpen: (ApiNotification) -> Unit,
    onMarkRead: (ApiNotification) -> Unit,
    onDelete: (ApiNotification) -> Unit,
    onQuickAction: (ApiNotification, NotificationQuickAction) -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    listState: androidx.compose.foundation.lazy.LazyListState,
) {
    val rows = remember(state.selectedCategory, state.notifications, state.categoryRows) { state.filteredNotifications }
    val pane = NotificationListStateReducer.pane(
        hasRows = rows.isNotEmpty(),
        isLoading = state.isLoading || state.isCategoryLoading,
        loadDidFail = state.loadDidFail,
    )

    LaunchedEffect(state.selectedCategory) { listState.scrollToItem(0) }
    LaunchedEffect(rows.firstOrNull()?.id) {
        if (listState.firstVisibleItemIndex <= 1) listState.animateScrollToItem(0)
    }
    val nearEnd by remember(listState) {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: -1
            info.totalItemsCount > 0 && last >= info.totalItemsCount - PREFETCH_DISTANCE
        }
    }
    LaunchedEffect(nearEnd, state.canLoadMore, rows.size) { if (nearEnd && state.canLoadMore) onLoadMore() }

    Crossfade(targetState = pane, animationSpec = tween(200), label = "notification-pane", modifier = Modifier.fillMaxSize()) { target ->
        when (target) {
            NotificationListPane.Skeleton -> NotificationListSkeleton()
            NotificationListPane.Error -> NotificationListErrorState(onRetry = onRetry)
            NotificationListPane.Empty -> NotificationListEmptyState(state.selectedCategory)
            NotificationListPane.Content -> LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
            ) {
                items(rows, key = { it.id }, contentType = { "notification" }) { notification ->
                    NotificationRow(
                        notification = notification,
                        isFriend = notification.actor?.id in state.friendIds,
                        isConnectRequested = notification.actor?.id in state.connectRequestedIds,
                        onOpen = onOpen,
                        onMarkRead = onMarkRead,
                        onDelete = onDelete,
                        onQuickAction = onQuickAction,
                        modifier = Modifier.animateItem(
                            fadeInSpec = tween(LIST_ANIMATION_MS, easing = EaseInOut),
                            placementSpec = tween(LIST_ANIMATION_MS, easing = EaseInOut),
                            fadeOutSpec = tween(LIST_ANIMATION_MS, easing = EaseInOut),
                        ),
                    )
                }
                if (state.canLoadMore || state.isLoadingMore) {
                    item(key = "loading-more", contentType = "loading") {
                        Box(Modifier.fillMaxWidth().padding(MeeshySpacing.md), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        }
                    }
                }
            }
        }
    }
}

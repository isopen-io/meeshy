package me.meeshy.app.notifications

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationQuickAction
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyTopBar
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing

private enum class ListPane { Skeleton, Error, Empty, Rows }

private const val PREFETCH_DISTANCE = 4

/**
 * @param onOpenConversation Navigate to a conversation ([NotificationDestination.Conversation]) — also
 *   where the « Écrire » quick action lands.
 * @param onOpenPost Navigate to a post/story/status detail ([NotificationDestination.Post]).
 * @param onOpenReel Navigate to a réel, anchored at its id ([NotificationDestination.Reel]).
 * @param onOpenStory Navigate to a user's story tray ([NotificationDestination.Story]).
 * @param onOpenProfile Navigate to a user's profile ([NotificationDestination.Profile]).
 *
 * Every parameter defaults to a no-op so existing callers keep compiling; wiring them is what
 * makes a row tap actually open its target (issue #4793).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel = hiltViewModel(),
    onOpenConversation: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onOpenReel: (String) -> Unit = {},
    onOpenStory: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val haptics = rememberMeeshyHaptics()
    val context = LocalContext.current
    val openConversation by rememberUpdatedState(onOpenConversation)
    val openPost by rememberUpdatedState(onOpenPost)
    val openReel by rememberUpdatedState(onOpenReel)
    val openStory by rememberUpdatedState(onOpenStory)
    val openProfile by rememberUpdatedState(onOpenProfile)

    LaunchedEffect(viewModel) {
        viewModel.events.collect { event ->
            when (event) {
                is NotificationsEvent.ActionFailed -> {
                    haptics.error()
                    snackbar.showSnackbar(context.getString(event.message))
                }
                is NotificationsEvent.OpenConversation -> openConversation(event.conversationId)
            }
        }
    }
    LaunchedEffect(state.errorMessage) {
        val message = state.errorMessage
        if (message != null && state.notifications.isNotEmpty()) snackbar.showSnackbar(message)
    }

    val onOpen = remember(viewModel, haptics) {
        { notification: ApiNotification ->
            haptics.light()
            viewModel.markAsRead(notification.id)
            NotificationDestinationResolver.resolve(notification).dispatch(
                onOpenConversation = { openConversation(it) },
                onOpenPost = { openPost(it) },
                onOpenReel = { openReel(it) },
                onOpenStory = { openStory(it) },
                onOpenProfile = { openProfile(it) },
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

    MeeshyBackground {
        Scaffold(
            topBar = {
                MeeshyTopBar(
                    title = stringResource(R.string.notifications_title),
                    actions = {
                        AnimatedVisibility(visible = state.unreadCount > 0, enter = fadeIn(), exit = fadeOut()) {
                            TextButton(onClick = onMarkAllRead) {
                                Text(stringResource(R.string.notifications_mark_all_read), color = MeeshyPalette.Indigo500)
                            }
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            containerColor = Color.Transparent,
        ) { padding ->
            Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                AnimatedVisibility(
                    visible = state.unreadCount > 0,
                    enter = fadeIn(tween(200)) + expandVertically(tween(200)),
                    exit = fadeOut(tween(150)) + shrinkVertically(tween(150)),
                ) {
                    Text(
                        text = pluralStringResource(R.plurals.notifications_unread_count, state.unreadCount, state.unreadCount),
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyPalette.Indigo500,
                        modifier = Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.xs),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
                NotificationCategoryBar(selected = state.selectedCategory, onSelect = onSelectCategory)
                PullToRefreshBox(
                    isRefreshing = state.isSyncing && state.notifications.isNotEmpty(),
                    onRefresh = onRetry,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    NotificationPanes(
                        state = state,
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
) {
    val rows = remember(state.selectedCategory, state.notifications, state.categoryRows) { state.filteredNotifications }
    val pane = when {
        (state.isLoading || state.isCategoryLoading) && rows.isEmpty() -> ListPane.Skeleton
        state.loadDidFail && rows.isEmpty() -> ListPane.Error
        rows.isEmpty() -> ListPane.Empty
        else -> ListPane.Rows
    }
    val listState = rememberLazyListState()

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
            ListPane.Skeleton -> NotificationListSkeleton()
            ListPane.Error -> NotificationListErrorState(onRetry = onRetry)
            ListPane.Empty -> NotificationListEmptyState(state.selectedCategory)
            ListPane.Rows -> LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                items(rows, key = { it.id }, contentType = { "notification" }) { notification ->
                    NotificationRow(
                        notification = notification,
                        isFriend = notification.actor?.id in state.friendIds,
                        isConnectRequested = notification.actor?.id in state.connectRequestedIds,
                        onOpen = onOpen,
                        onMarkRead = onMarkRead,
                        onDelete = onDelete,
                        onQuickAction = onQuickAction,
                        modifier = Modifier.animateItem(),
                    )
                }
                if (state.isLoadingMore) {
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

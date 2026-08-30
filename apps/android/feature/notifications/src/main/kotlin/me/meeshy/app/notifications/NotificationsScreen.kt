package me.meeshy.app.notifications

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MarkEmailRead
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.notifications.R
import me.meeshy.sdk.model.ApiNotification
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.model.notificationTypeAccentHex
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.component.chrome.MeeshyTopBar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let { snackbar.showSnackbar(it) }
    }

    MeeshyBackground {
        Scaffold(
            topBar = {
                MeeshyTopBar(
                    title = stringResource(R.string.notifications_title),
                    actions = {
                        if (state.notifications.any { !it.state.isRead }) {
                            TextButton(onClick = viewModel::markAllRead) {
                                Text(stringResource(R.string.notifications_mark_all_read))
                            }
                        }
                    },
                )
            },
            snackbarHost = { SnackbarHost(snackbar) },
            containerColor = Color.Transparent,
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                if (!state.isLoading && state.notifications.isNotEmpty()) {
                    NotificationCategoryChips(
                        selected = state.selectedCategory,
                        onSelect = viewModel::selectCategory,
                    )
                }
                PullToRefreshBox(
                    isRefreshing = state.isSyncing,
                    onRefresh = viewModel::load,
                    modifier = Modifier.fillMaxSize(),
                ) {
                    val rows = state.filteredNotifications
                    when {
                        state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = MeeshyPalette.Indigo500)
                        }
                        rows.isEmpty() -> Box(
                            Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = stringResource(
                                    if (state.notifications.isEmpty()) {
                                        R.string.notifications_empty
                                    } else {
                                        R.string.notifications_empty_category
                                    },
                                ),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MeeshyTheme.tokens.textSecondary,
                            )
                        }
                        else -> LazyColumn {
                            itemsIndexed(rows, key = { _, item -> item.id }) { index, notification ->
                                if (index == rows.lastIndex) {
                                    LaunchedEffect(notification.id) { viewModel.loadMore() }
                                }
                                NotificationItem(
                                    notification = notification,
                                    onTap = { viewModel.markAsRead(notification.id) },
                                    onMarkRead = { viewModel.markAsRead(notification.id) },
                                    onDelete = { viewModel.deleteNotification(notification.id) },
                                )
                                HorizontalDivider(color = MeeshyTheme.tokens.inputBorder.copy(alpha = 0.4f))
                            }
                            if (state.isLoadingMore) {
                                item {
                                    Box(
                                        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * The 11-chip filter bar of the notification center — port of iOS `NotificationListView`'s
 * category chips. Horizontally scrollable, single-select; the active chip carries its category's
 * deterministic [NotificationFilterCategory.accentHex] so the bar colour-codes consistently with the
 * per-row accents. Selecting a chip is a pure client-side projection (no refetch).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationCategoryChips(
    selected: NotificationFilterCategory,
    onSelect: (NotificationFilterCategory) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        NotificationFilterCategory.entries.forEach { category ->
            val isSelected = category == selected
            val accent = hexColor(category.accentHex)
            FilterChip(
                selected = isSelected,
                onClick = { onSelect(category) },
                label = { Text(stringResource(category.labelRes())) },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = accent.copy(alpha = 0.18f),
                    selectedLabelColor = accent,
                ),
            )
        }
    }
}

@StringRes
private fun NotificationFilterCategory.labelRes(): Int = when (this) {
    NotificationFilterCategory.ALL -> R.string.notifications_category_all
    NotificationFilterCategory.UNREAD -> R.string.notifications_category_unread
    NotificationFilterCategory.MESSAGES -> R.string.notifications_category_messages
    NotificationFilterCategory.REACTIONS -> R.string.notifications_category_reactions
    NotificationFilterCategory.MENTIONS -> R.string.notifications_category_mentions
    NotificationFilterCategory.SOCIAL -> R.string.notifications_category_social
    NotificationFilterCategory.CONTACTS -> R.string.notifications_category_contacts
    NotificationFilterCategory.GROUPS -> R.string.notifications_category_groups
    NotificationFilterCategory.CALLS -> R.string.notifications_category_calls
    NotificationFilterCategory.TRANSLATIONS -> R.string.notifications_category_translations
    NotificationFilterCategory.SYSTEM -> R.string.notifications_category_system
}

/**
 * Port of iOS `NotificationRowView`'s `.swipeActions`: trailing (end-to-start) swipe deletes,
 * leading (start-to-end) swipe marks read — only offered while unread, mirroring iOS's
 * `if !notification.isRead`. Non-destructive at the gesture level (mirrors the established
 * `ConversationListScreen` pattern): the swipe box always snaps back, and the row's actual
 * removal/re-style comes from the repository cache mutation flowing back through [state].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationItem(
    notification: ApiNotification,
    onTap: () -> Unit,
    onMarkRead: () -> Unit,
    onDelete: () -> Unit,
) {
    val isUnread = !notification.state.isRead
    val accent = hexColor(notificationTypeAccentHex(notification.type))

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> if (isUnread) onMarkRead()
                SwipeToDismissBoxValue.EndToStart -> onDelete()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            false
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = { NotificationSwipeBackground(direction = dismissState.dismissDirection, isUnread = isUnread) },
    ) {
        Surface(
            onClick = onTap,
            color = if (isUnread) accent.copy(alpha = 0.12f) else Color.Transparent,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MeeshyAvatar(
                    name = notification.actor?.displayName ?: notification.actor?.username ?: "?",
                    modifier = Modifier.size(44.dp),
                    containerColor = accent,
                )
                Spacer(Modifier.width(MeeshySpacing.md))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = notification.actor?.displayName ?: notification.actor?.username
                                ?: stringResource(R.string.notifications_system_sender),
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textPrimary,
                            fontWeight = if (isUnread) FontWeight.SemiBold else FontWeight.Normal,
                        )
                        if (isUnread) {
                            Spacer(Modifier.width(MeeshySpacing.sm))
                            Box(
                                Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(accent),
                            )
                        }
                    }
                    notification.content?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                    notificationRowRelativeTime(notification)?.let { relativeTime ->
                        Text(
                            text = relativeTime,
                            style = MaterialTheme.typography.labelSmall,
                            color = MeeshyTheme.tokens.textMuted,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationSwipeBackground(direction: SwipeToDismissBoxValue, isUnread: Boolean) {
    val (alignment, icon, description, background) = when {
        direction == SwipeToDismissBoxValue.StartToEnd && isUnread -> NotificationSwipeVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.MarkEmailRead,
            description = stringResource(R.string.notifications_action_mark_read),
            background = MeeshyPalette.Indigo500.copy(alpha = 0.20f),
        )
        direction == SwipeToDismissBoxValue.EndToStart -> NotificationSwipeVisual(
            alignment = Alignment.CenterEnd,
            icon = Icons.Filled.Delete,
            description = stringResource(R.string.notifications_action_delete),
            background = MeeshyPalette.Error.copy(alpha = 0.20f),
        )
        else -> NotificationSwipeVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.MarkEmailRead,
            description = "",
            background = Color.Transparent,
        )
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(background)
            .padding(horizontal = MeeshySpacing.xl),
        contentAlignment = alignment,
    ) {
        if (background != Color.Transparent) {
            Icon(imageVector = icon, contentDescription = description, tint = MeeshyTheme.tokens.textSecondary)
        }
    }
}

private data class NotificationSwipeVisual(
    val alignment: Alignment,
    val icon: ImageVector,
    val description: String,
    val background: Color,
)

/**
 * The notification row's arrival timestamp as a compact relative label ("5 min", "2 h", "3 j", …)
 * — the Android parity of iOS `NotificationRowView`'s
 * `RelativeTimeFormatter.shortString(for: notification.createdAt)`, replacing the previous absolute
 * short date-time. Returns null when the notification carries no parseable `createdAt`, so the row
 * shows no label rather than a raw/garbled string. The [rememberRelativeTimeStrings] read stays
 * before the early return to keep the composable-call graph unconditional.
 */
@Composable
private fun notificationRowRelativeTime(notification: ApiNotification): String? {
    val strings = rememberRelativeTimeStrings()
    val millis = NotificationRowTime.epochMillis(notification) ?: return null
    return RelativeTimeFormat.short(
        epochMillis = millis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}

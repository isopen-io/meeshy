package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Unarchive
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    onConversationClick: (String) -> Unit,
    onLogout: () -> Unit,
    viewModel: ConversationListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        topBar = {
            TopAppBar(
                title = {
                    if (state.isSearchActive) {
                        ConversationSearchField(
                            query = state.searchText,
                            onQueryChange = viewModel::setSearch,
                        )
                    } else {
                        Text(stringResource(R.string.conversations_title), fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    if (state.isSearchActive) {
                        IconButton(onClick = { viewModel.setSearchActive(false) }) {
                            Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.conversations_search_close))
                        }
                    } else {
                        IconButton(onClick = { viewModel.setSearchActive(true) }) {
                            Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.conversations_search))
                        }
                        IconButton(onClick = onLogout) {
                            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = stringResource(R.string.conversations_logout))
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            ConnectionBannerStrip(state.banner)
            ConversationFilterBar(
                selected = state.selectedFilter,
                onSelect = viewModel::selectFilter,
            )
            Box(modifier = Modifier.weight(1f)) {
                when {
                    state.showSkeleton -> SkeletonList()

                    state.conversations.isEmpty() && state.errorMessage != null ->
                        CenteredMessage(
                            state.errorMessage!!,
                            stringResource(R.string.conversations_retry),
                            viewModel::refresh,
                        )

                    state.conversations.isEmpty() && state.isFilteredEmpty ->
                        CenteredMessage(stringResource(R.string.conversations_no_results), null, null)

                    state.conversations.isEmpty() ->
                        CenteredMessage(stringResource(R.string.conversations_empty), null, null)

                    else -> PullToRefreshBox(
                        isRefreshing = state.isUserRefreshing,
                        onRefresh = viewModel::refresh,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            items(state.conversations, key = { it.id }) { conversation ->
                                ConversationRow(
                                    conversation = conversation,
                                    currentUserId = state.currentUserId,
                                    onClick = { onConversationClick(conversation.id) },
                                    onTogglePin = { viewModel.togglePin(conversation) },
                                    onToggleMute = { viewModel.toggleMute(conversation) },
                                    onToggleArchive = { viewModel.toggleArchive(conversation) },
                                )
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
private fun ConversationSearchField(
    query: String,
    onQueryChange: (String) -> Unit,
) {
    TextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        placeholder = { Text(stringResource(R.string.conversations_search_hint)) },
        colors = TextFieldDefaults.colors(
            focusedContainerColor = Color.Transparent,
            unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
    )
}

@Composable
private fun ConnectionBannerStrip(banner: ConnectionBanner, modifier: Modifier = Modifier) {
    AnimatedVisibility(visible = banner != ConnectionBanner.HIDDEN, modifier = modifier) {
        val (label, background, foreground) = when (banner) {
            ConnectionBanner.SYNCING -> Triple(
                stringResource(R.string.conversations_banner_syncing),
                MeeshyTheme.tokens.backgroundTertiary,
                MeeshyTheme.tokens.textSecondary,
            )
            ConnectionBanner.RECONNECTING -> Triple(
                stringResource(R.string.conversations_banner_reconnecting),
                MeeshyPalette.Warning.copy(alpha = 0.18f),
                MeeshyPalette.Warning,
            )
            else -> Triple(
                stringResource(R.string.conversations_banner_offline),
                MeeshyTheme.tokens.backgroundTertiary,
                MeeshyTheme.tokens.textSecondary,
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .background(background)
                .padding(vertical = MeeshySpacing.xs),
        )
    }
}

/**
 * Visual mapping for a [ConversationSwipeAction] — icon + tint + label resolved
 * from the action's current toggled state. Kept here so leaf rows stay pure;
 * the action *set* itself comes from [ConversationSwipeActions]. Tints mirror
 * iOS (`ConversationListView+Rows.swift`): pin = indigo, mute = slate, archive
 * = amber.
 */
private data class SwipeVisual(val icon: ImageVector, val tint: Color, val label: String)

@Composable
private fun ConversationSwipeItem.visual(): SwipeVisual = when (action) {
    ConversationSwipeAction.PIN -> SwipeVisual(
        icon = Icons.Filled.PushPin,
        tint = MeeshyPalette.Indigo400,
        label = stringResource(if (active) R.string.swipe_unpin else R.string.swipe_pin),
    )
    ConversationSwipeAction.MUTE -> SwipeVisual(
        icon = if (active) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
        tint = MeeshyTheme.tokens.textSecondary,
        label = stringResource(if (active) R.string.swipe_unmute else R.string.swipe_mute),
    )
    ConversationSwipeAction.ARCHIVE -> SwipeVisual(
        icon = if (active) Icons.Filled.Unarchive else Icons.Filled.Archive,
        tint = MeeshyPalette.Warning,
        label = stringResource(if (active) R.string.swipe_unarchive else R.string.swipe_archive),
    )
}

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun ConversationRow(
    conversation: ApiConversation,
    currentUserId: String?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleArchive: () -> Unit,
) {
    val pin = ConversationSwipeActions.leading(conversation).first { it.action == ConversationSwipeAction.PIN }
    val archive = ConversationSwipeActions.trailing(conversation).first { it.action == ConversationSwipeAction.ARCHIVE }
    val pinVisual = pin.visual()
    val archiveVisual = archive.visual()

    val swipeState = rememberSwipeToDismissBoxState(
        // Snap back after triggering — the row is a trigger, never dismissed.
        confirmValueChange = { value ->
            when (value) {
                SwipeToDismissBoxValue.StartToEnd -> onTogglePin()
                SwipeToDismissBoxValue.EndToStart -> onToggleArchive()
                SwipeToDismissBoxValue.Settled -> Unit
            }
            false
        },
    )

    SwipeToDismissBox(
        state = swipeState,
        backgroundContent = {
            val leading = swipeState.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            val visual = if (leading) pinVisual else archiveVisual
            SwipeActionBackground(
                visual = visual,
                alignment = if (leading) Alignment.CenterStart else Alignment.CenterEnd,
            )
        },
    ) {
        ConversationRowContent(
            conversation = conversation,
            currentUserId = currentUserId,
            onClick = onClick,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleArchive = onToggleArchive,
        )
    }
}

@Composable
private fun SwipeActionBackground(visual: SwipeVisual, alignment: Alignment) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(visual.tint.copy(alpha = 0.16f))
            .padding(horizontal = MeeshySpacing.lg),
        contentAlignment = alignment,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(visual.icon, contentDescription = null, tint = visual.tint)
            Text(
                text = visual.label,
                style = MaterialTheme.typography.labelMedium,
                color = visual.tint,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = MeeshySpacing.xs),
            )
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun ConversationRowContent(
    conversation: ApiConversation,
    currentUserId: String?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleArchive: () -> Unit,
) {
    val title = conversation.displayTitle()
    var menuExpanded by remember { mutableStateOf(false) }
    val previewLabels = LastMessagePreviewLabels(
        photo = stringResource(R.string.conversations_preview_photo),
        video = stringResource(R.string.conversations_preview_video),
        voice = stringResource(R.string.conversations_preview_voice),
        file = stringResource(R.string.conversations_preview_file),
        location = stringResource(R.string.conversations_preview_location),
        none = stringResource(R.string.conversations_no_messages),
        you = stringResource(R.string.conversations_preview_you),
        senderFormat = stringResource(R.string.conversations_preview_sender_format),
    )
    Box {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyTheme.tokens.backgroundPrimary)
                .combinedClickable(onClick = onClick, onLongClick = { menuExpanded = true })
                .semantics { role = Role.Button; contentDescription = title }
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(
                name = title,
                containerColor = hexColor(conversation.accentHex()),
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = MeeshySpacing.md),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (conversation.isPinned) {
                        Icon(
                            Icons.Filled.PushPin,
                            contentDescription = stringResource(R.string.swipe_pin),
                            tint = MeeshyPalette.Indigo400,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(end = MeeshySpacing.xs),
                        )
                    }
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (conversation.isMuted) {
                        Icon(
                            Icons.Filled.NotificationsOff,
                            contentDescription = stringResource(R.string.swipe_mute),
                            tint = MeeshyTheme.tokens.textMuted,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(start = MeeshySpacing.xs),
                        )
                    }
                }
                Text(
                    text = lastMessagePreview(
                        message = conversation.lastMessage,
                        currentUserId = currentUserId,
                        showSender = conversation.type != "direct",
                        labels = previewLabels,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (conversation.unreadCount > 0) {
                Badge { Text(conversation.unreadCount.coerceAtMost(99).toString()) }
            }
        }

        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
            val items = ConversationSwipeActions.leading(conversation) +
                ConversationSwipeActions.trailing(conversation)
            items.forEach { item ->
                val visual = item.visual()
                DropdownMenuItem(
                    text = { Text(visual.label) },
                    leadingIcon = { Icon(visual.icon, contentDescription = null, tint = visual.tint) },
                    onClick = {
                        menuExpanded = false
                        when (item.action) {
                            ConversationSwipeAction.PIN -> onTogglePin()
                            ConversationSwipeAction.MUTE -> onToggleMute()
                            ConversationSwipeAction.ARCHIVE -> onToggleArchive()
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun SkeletonList() {
    Column(modifier = Modifier.fillMaxSize()) {
        repeat(8) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MeeshySkeletonBox(modifier = Modifier.size(48.dp), shape = CircleShape)
                MeeshySkeletonBox(
                    modifier = Modifier
                        .padding(start = MeeshySpacing.md)
                        .size(width = 160.dp, height = 14.dp),
                )
            }
        }
    }
}

@Composable
private fun CenteredMessage(message: String, actionLabel: String?, onAction: (() -> Unit)?) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        if (actionLabel != null && onAction != null) {
            Button(onClick = onAction, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
                Text(actionLabel)
            }
        }
    }
}

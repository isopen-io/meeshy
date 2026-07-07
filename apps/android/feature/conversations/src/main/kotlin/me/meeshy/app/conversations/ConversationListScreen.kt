package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MarkChatRead
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.CollapsibleSection
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.FloatingGradientFab
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    onConversationClick: (String) -> Unit,
    onLogout: () -> Unit,
    onNewConversation: () -> Unit = {},
    onContacts: () -> Unit = {},
    viewModel: ConversationListViewModel = hiltViewModel(),
    header: @Composable () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            LargeTopAppBar(
                colors = TopAppBarDefaults.largeTopAppBarColors(
                    containerColor = Color.Transparent,
                    scrolledContainerColor = Color.Transparent,
                    titleContentColor = MeeshyPalette.Indigo500,
                    actionIconContentColor = MeeshyTheme.tokens.textSecondary,
                ),
                title = {
                    Text(
                        text = stringResource(R.string.conversations_title),
                        style = MaterialTheme.typography.displayMedium,
                        color = MeeshyPalette.Indigo500,
                    )
                },
                actions = {
                    // iOS parity: search moves to the bottom bar; sign-out lives in
                    // Settings (Danger section), so the top keeps only Contacts.
                    IconButton(onClick = onContacts) {
                        Icon(Icons.Filled.People, contentDescription = stringResource(R.string.conversations_contacts))
                    }
                },
            )
        },
        bottomBar = {
            ConversationSearchBar(
                query = state.searchText,
                onQueryChange = viewModel::setSearch,
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            ConnectionBannerStrip(state.banner)
            header()
            // iOS parity: no Material filter chips on the conversation list — the
            // filter state stays (defaults to ALL) but the chip row is not rendered.
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
                        val pinned = state.conversations.filter { it.resolvedPreferences?.isPinned == true }
                        val others = state.conversations.filterNot { it.resolvedPreferences?.isPinned == true }
                        val row: @Composable (ApiConversation) -> Unit = { conversation ->
                            ConversationRow(
                                conversation = conversation,
                                currentUserId = state.currentUserId,
                                draft = state.draftFor(conversation.id),
                                onClick = { onConversationClick(conversation.id) },
                                onTogglePin = { viewModel.togglePin(conversation.id) },
                                onToggleMute = { viewModel.toggleMute(conversation.id) },
                                onToggleArchive = { viewModel.toggleArchive(conversation.id) },
                                onMarkRead = { viewModel.markRead(conversation.id) },
                            )
                        }
                        // Sections (parity iOS): Épingles first, then Mes conversations.
                        // Section bodies compose eagerly (few items on a real account);
                        // revisit for lazy paging if a user has hundreds of threads.
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            if (pinned.isNotEmpty()) {
                                item(key = "section-pinned") {
                                    CollapsibleSection(
                                        title = stringResource(R.string.conversations_section_pinned),
                                        count = pinned.size,
                                        iconContainerColor = MeeshyPalette.Error,
                                        icon = {
                                            Icon(
                                                Icons.Filled.PushPin,
                                                contentDescription = null,
                                                tint = MeeshyPalette.White,
                                                modifier = Modifier.size(16.dp),
                                            )
                                        },
                                    ) { pinned.forEach { row(it) } }
                                }
                            }
                            item(key = "section-all") {
                                CollapsibleSection(
                                    title = stringResource(R.string.conversations_section_all),
                                    count = others.size,
                                    iconContainerColor = MeeshyPalette.Indigo500,
                                    icon = {
                                        Icon(
                                            Icons.AutoMirrored.Filled.Chat,
                                            contentDescription = null,
                                            tint = MeeshyPalette.White,
                                            modifier = Modifier.size(16.dp),
                                        )
                                    },
                                ) { others.forEach { row(it) } }
                            }
                        }
                    }
                }
            }
        }
    }
    }
}

/** iOS parity: a floating glass search pill anchored to the bottom of the screen. */
@Composable
private fun ConversationSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
) {
    MeeshyGlassSurface(
        shape = RoundedCornerShape(MeeshyRadius.pill),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(20.dp),
            )
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = MeeshyTheme.tokens.textPrimary),
                cursorBrush = SolidColor(MeeshyPalette.Indigo500),
                modifier = Modifier
                    .weight(1f)
                    .padding(start = MeeshySpacing.sm),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (query.isEmpty()) {
                            Text(
                                text = stringResource(R.string.conversations_search_hint),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MeeshyTheme.tokens.textMuted,
                            )
                        }
                        inner()
                    }
                },
            )
        }
    }
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationRow(
    conversation: ApiConversation,
    currentUserId: String?,
    draft: ConversationDraft?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleArchive: () -> Unit,
    onMarkRead: () -> Unit,
) {
    val prefs = conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isMuted = prefs?.isMuted == true
    val isArchived = prefs?.isArchived == true

    // Swipe snaps back after firing the action (non-destructive) — the visual
    // outcome is the row re-sorting/re-filtering itself once the cache mutates.
    val dismissState = rememberSwipeToDismissBoxState(
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
        state = dismissState,
        backgroundContent = {
            SwipeActionBackground(
                direction = dismissState.dismissDirection,
                isPinned = isPinned,
                isArchived = isArchived,
            )
        },
    ) {
        ConversationRowContent(
            conversation = conversation,
            currentUserId = currentUserId,
            draft = draft,
            isPinned = isPinned,
            isMuted = isMuted,
            isArchived = isArchived,
            onClick = onClick,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleArchive = onToggleArchive,
            onMarkRead = onMarkRead,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun ConversationRowContent(
    conversation: ApiConversation,
    currentUserId: String?,
    draft: ConversationDraft?,
    isPinned: Boolean,
    isMuted: Boolean,
    isArchived: Boolean,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleArchive: () -> Unit,
    onMarkRead: () -> Unit,
) {
    val title = conversation.displayTitle(currentUserId)
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
        draftPrefix = stringResource(R.string.conversations_preview_draft_prefix),
    )
    val draftLine = draftPreview(draft, previewLabels)
    Box {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.xl),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = { menuExpanded = true },
                )
                .semantics { role = Role.Button; contentDescription = title },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
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
                    if (isPinned) {
                        Icon(
                            imageVector = Icons.Filled.PushPin,
                            contentDescription = stringResource(R.string.conversations_badge_pinned),
                            tint = MeeshyTheme.tokens.textSecondary,
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
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (isMuted) {
                        Icon(
                            imageVector = Icons.Filled.NotificationsOff,
                            contentDescription = stringResource(R.string.conversations_badge_muted),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(start = MeeshySpacing.xs),
                        )
                    }
                }
                Text(
                    text = draftLine ?: lastMessagePreview(
                        message = conversation.lastMessage,
                        currentUserId = currentUserId,
                        showSender = conversation.type != "direct",
                        labels = previewLabels,
                    ),
                    style = MaterialTheme.typography.bodySmall,
                    color = if (draftLine != null) {
                        hexColor(conversation.accentHex())
                    } else {
                        MeeshyTheme.tokens.textSecondary
                    },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (conversation.unreadCount > 0) {
                Badge { Text(conversation.unreadCount.coerceAtMost(99).toString()) }
            }
            }
        }

        ConversationContextMenu(
            expanded = menuExpanded,
            onDismiss = { menuExpanded = false },
            isPinned = isPinned,
            isMuted = isMuted,
            isArchived = isArchived,
            hasUnread = conversation.unreadCount > 0,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleArchive = onToggleArchive,
            onMarkRead = onMarkRead,
        )
    }
}

@Composable
private fun ConversationContextMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    isPinned: Boolean,
    isMuted: Boolean,
    isArchived: Boolean,
    hasUnread: Boolean,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleArchive: () -> Unit,
    onMarkRead: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isPinned) R.string.conversations_action_unpin
                        else R.string.conversations_action_pin,
                    ),
                )
            },
            leadingIcon = { Icon(Icons.Filled.PushPin, contentDescription = null) },
            onClick = { onTogglePin(); onDismiss() },
        )
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isMuted) R.string.conversations_action_unmute
                        else R.string.conversations_action_mute,
                    ),
                )
            },
            leadingIcon = {
                Icon(
                    if (isMuted) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                    contentDescription = null,
                )
            },
            onClick = { onToggleMute(); onDismiss() },
        )
        if (hasUnread) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_mark_read)) },
                leadingIcon = { Icon(Icons.Filled.MarkChatRead, contentDescription = null) },
                onClick = { onMarkRead(); onDismiss() },
            )
        }
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isArchived) R.string.conversations_action_unarchive
                        else R.string.conversations_action_archive,
                    ),
                )
            },
            leadingIcon = { Icon(Icons.Filled.Archive, contentDescription = null) },
            onClick = { onToggleArchive(); onDismiss() },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeActionBackground(
    direction: SwipeToDismissBoxValue,
    isPinned: Boolean,
    isArchived: Boolean,
) {
    val (alignment, icon, description, background) = when (direction) {
        SwipeToDismissBoxValue.StartToEnd -> SwipeActionVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.PushPin,
            description = stringResource(
                if (isPinned) R.string.conversations_action_unpin
                else R.string.conversations_action_pin,
            ),
            background = MeeshyPalette.Warning.copy(alpha = 0.20f),
        )
        SwipeToDismissBoxValue.EndToStart -> SwipeActionVisual(
            alignment = Alignment.CenterEnd,
            icon = Icons.Filled.Archive,
            description = stringResource(
                if (isArchived) R.string.conversations_action_unarchive
                else R.string.conversations_action_archive,
            ),
            background = MeeshyTheme.tokens.backgroundTertiary,
        )
        SwipeToDismissBoxValue.Settled -> SwipeActionVisual(
            alignment = Alignment.CenterStart,
            icon = Icons.Filled.PushPin,
            description = "",
            background = Color.Transparent,
        )
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(background)
            .padding(horizontal = MeeshySpacing.xl),
        contentAlignment = alignment,
    ) {
        if (direction != SwipeToDismissBoxValue.Settled) {
            Icon(
                imageVector = icon,
                contentDescription = description,
                tint = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

private data class SwipeActionVisual(
    val alignment: Alignment,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val description: String,
    val background: Color,
)

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

package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NoEncryption
import androidx.compose.material.icons.filled.ManageSearch
import androidx.compose.material.icons.filled.MarkChatRead
import androidx.compose.material.icons.filled.MarkChatUnread
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.ConversationCategoryPicker
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.currentUserRole
import me.meeshy.sdk.model.isMeaningful
import me.meeshy.sdk.model.resolvedLastMessagePreview
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.CollapsibleSection
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.chrome.FloatingGradientFab
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor
import java.time.ZoneId
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationListScreen(
    onConversationClick: (String) -> Unit,
    onLogout: () -> Unit,
    onNewConversation: () -> Unit = {},
    onContacts: () -> Unit = {},
    onDashboard: () -> Unit = {},
    onGlobalSearch: () -> Unit = {},
    viewModel: ConversationListViewModel = hiltViewModel(),
    header: @Composable () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // A tap resolves to navigation only through the ViewModel's one-shot gate: an
    // unlocked row emits immediately; a locked row emits after its PIN sheet accepts
    // the code. Collecting the event (not reading state) keeps a config-change replay
    // from re-navigating.
    LaunchedEffect(viewModel) {
        viewModel.openConversation.collect { onConversationClick(it) }
    }

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
                    // A global "unlock all" affordance surfaces only while at least one
                    // conversation is locked (parity iOS Settings, which offers unlock-all
                    // contextually) — tapping it opens the master-PIN sheet that drops every
                    // lock at once. Hidden otherwise, so the bar stays quiet in the common case.
                    if (state.canUnlockAll) {
                        IconButton(onClick = viewModel::onUnlockAll) {
                            Icon(
                                Icons.Filled.LockOpen,
                                contentDescription = stringResource(R.string.conversations_unlock_all),
                            )
                        }
                    }
                    // Master-PIN management (parity iOS Settings → change / remove master
                    // PIN). Surfaces only once a master PIN exists; "Remove" additionally
                    // hides while any conversation is locked (see canRemoveMasterPin).
                    if (state.hasMasterPin) {
                        LockSecurityMenu(
                            canChange = state.canChangeMasterPin,
                            canRemove = state.canRemoveMasterPin,
                            onChange = viewModel::onChangeMasterPin,
                            onRemove = viewModel::onRemoveMasterPin,
                        )
                    }
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
                onDashboard = onDashboard,
                onGlobalSearch = onGlobalSearch,
            )
        },
        // Le chemin DIRECT vers une nouvelle conversation : l'item "New" du menu
        // flottant reste, mais une action aussi centrale merite un bouton visible
        // en permanence (l'import FloatingGradientFab dormait ici, jamais pose).
        floatingActionButton = {
            FloatingGradientFab(
                onClick = onNewConversation,
                contentDescription = stringResource(R.string.conversations_new),
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
                when (val content = ConversationListContent.of(state)) {
                    ConversationListContent.Skeleton -> SkeletonList()

                    is ConversationListContent.Error,
                    ConversationListContent.FilteredEmpty,
                    ConversationListContent.ColdEmpty ->
                        EmptyStateVisual.of(content)?.let { visual ->
                            EmptyStateCard(visual = visual, onRetry = viewModel::refresh)
                        }

                    ConversationListContent.Populated -> PullToRefreshBox(
                        isRefreshing = state.isUserRefreshing,
                        onRefresh = viewModel::refresh,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        val row: @Composable (ApiConversation) -> Unit = { conversation ->
                            ConversationRow(
                                conversation = conversation,
                                currentUserId = state.currentUserId,
                                currentUserPrefs = state.currentUser,
                                presence = state.presenceStateFor(conversation, System.currentTimeMillis()),
                                storyRing = state.storyRingFor(conversation, System.currentTimeMillis()),
                                moodEmoji = state.moodEmojiFor(conversation),
                                draft = state.draftFor(conversation.id),
                                typingDisplayName = state.typingDisplayNameFor(conversation.id),
                                categories = state.categories,
                                previewMessages = state.previewFor(conversation.id),
                                onClick = { viewModel.onConversationTap(conversation.id) },
                                onTogglePin = { viewModel.togglePin(conversation.id) },
                                onToggleMute = { viewModel.toggleMute(conversation.id) },
                                onToggleMentionsOnly = { viewModel.toggleMentionsOnly(conversation.id) },
                                onToggleArchive = { viewModel.toggleArchive(conversation.id) },
                                onLeaveConversation = { viewModel.leaveConversation(conversation.id) },
                                onDeleteForMe = { viewModel.deleteConversationForMe(conversation.id) },
                                onDeleteForAll = { viewModel.deleteConversationForAll(conversation.id) },
                                onRename = { viewModel.setCustomName(conversation.id, it) },
                                onSetReaction = { viewModel.setReaction(conversation.id, it) },
                                onSetTags = { viewModel.setTags(conversation.id, it) },
                                onMarkRead = { viewModel.markRead(conversation.id) },
                                onMarkUnread = { viewModel.markUnread(conversation.id) },
                                onDiscardDraft = { viewModel.discardDraft(conversation.id) },
                                onAssignCategory = { viewModel.reassignCategory(conversation.id, it) },
                                onCreateCategory = { viewModel.createCategoryAndAssign(conversation.id, it) },
                                onLoadPreview = { viewModel.loadPreviewMessages(conversation.id) },
                                isLocked = state.isLocked(conversation.id),
                                onLockToggle = { viewModel.onLockToggle(conversation.id) },
                            )
                        }
                        // Sections (parity iOS): Épingles first, then Mes conversations.
                        // The pinned/others split is the pure ConversationSections SSOT,
                        // which also omits an empty section (no phantom "Mes conversations"
                        // header when every row is pinned). Section bodies compose eagerly
                        // (few items on a real account); revisit for lazy paging if a user
                        // has hundreds of threads.
                        val sections = ConversationSections.of(state.conversations, state.categories)
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            sections.forEach { section ->
                                val key = section.categoryId?.let { "section-cat-$it" }
                                    ?: "section-${section.kind}"
                                item(key = key) {
                                    CollapsibleSection(
                                        title = section.title
                                            ?: stringResource(section.kind.titleRes()),
                                        count = section.items.size,
                                        iconContainerColor = section.kind.containerColor(),
                                        icon = {
                                            Icon(
                                                section.kind.icon(),
                                                contentDescription = null,
                                                tint = MeeshyPalette.White,
                                                modifier = Modifier.size(16.dp),
                                            )
                                        },
                                    ) { section.items.forEach { row(it) } }
                                }
                            }
                        }
                    }
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

/**
 * Master-PIN management overflow (parity iOS Settings → change / remove master PIN).
 * A dumb renderer: the enablement decisions live on [ConversationListUiState]
 * ([ConversationListUiState.canChangeMasterPin] / [canRemoveMasterPin]); this only draws
 * the menu and forwards the intent. Menu-open is local UI state, closed after each pick.
 */
@Composable
private fun LockSecurityMenu(
    canChange: Boolean,
    canRemove: Boolean,
    onChange: () -> Unit,
    onRemove: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    IconButton(onClick = { expanded = true }) {
        Icon(
            Icons.Filled.MoreVert,
            contentDescription = stringResource(R.string.conversations_lock_security_menu),
        )
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        if (canChange) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_change_master_pin)) },
                leadingIcon = { Icon(Icons.Filled.LockReset, contentDescription = null) },
                onClick = {
                    expanded = false
                    onChange()
                },
            )
        }
        if (canRemove) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_remove_master_pin)) },
                leadingIcon = { Icon(Icons.Filled.NoEncryption, contentDescription = null) },
                onClick = {
                    expanded = false
                    onRemove()
                },
            )
        }
    }
}

/** iOS parity: a floating glass search pill anchored to the bottom of the screen.
 *  Trailing, comme iOS `themedSearchBar` : l'icone grille ouvre le tableau de
 *  bord (`square.grid.2x2` -> WidgetPreview) et la loupe-texte la recherche
 *  globale (`text.magnifyingglass` -> GlobalSearch). */
@Composable
private fun ConversationSearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onDashboard: () -> Unit = {},
    onGlobalSearch: () -> Unit = {},
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
            IconButton(onClick = onDashboard, modifier = Modifier.size(32.dp)) {
                Icon(
                    imageVector = Icons.Filled.GridView,
                    contentDescription = stringResource(R.string.conversations_open_dashboard),
                    tint = MeeshyPalette.Warning,
                    modifier = Modifier.size(20.dp),
                )
            }
            Spacer(Modifier.width(MeeshySpacing.sm))
            IconButton(onClick = onGlobalSearch, modifier = Modifier.size(32.dp)) {
                Icon(
                    imageVector = Icons.Filled.ManageSearch,
                    contentDescription = stringResource(R.string.conversations_open_global_search),
                    tint = MeeshyPalette.Indigo500,
                    modifier = Modifier.size(22.dp),
                )
            }
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
    currentUserPrefs: MeeshyUser?,
    presence: PresenceState?,
    storyRing: StoryRingState,
    moodEmoji: String?,
    draft: ConversationDraft?,
    typingDisplayName: String?,
    categories: List<CategoryOption>,
    previewMessages: List<LocalMessage>?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleMentionsOnly: () -> Unit,
    onToggleArchive: () -> Unit,
    onLeaveConversation: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForAll: () -> Unit,
    onRename: (String) -> Unit,
    onSetReaction: (String?) -> Unit,
    onSetTags: (List<String>) -> Unit,
    onMarkRead: () -> Unit,
    onMarkUnread: () -> Unit,
    onDiscardDraft: () -> Unit,
    onAssignCategory: (String) -> Unit,
    onCreateCategory: (String) -> Unit,
    onLoadPreview: () -> Unit,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
) {
    val prefs = conversation.resolvedPreferences
    val isPinned = prefs?.isPinned == true
    val isMuted = prefs?.isMuted == true
    val mentionsOnly = prefs?.mentionsOnly == true
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
            currentUserPrefs = currentUserPrefs,
            presence = presence,
            storyRing = storyRing,
            moodEmoji = moodEmoji,
            draft = draft,
            typingDisplayName = typingDisplayName,
            isPinned = isPinned,
            isMuted = isMuted,
            mentionsOnly = mentionsOnly,
            isArchived = isArchived,
            categories = categories,
            currentCategoryId = prefs?.categoryId,
            previewMessages = previewMessages,
            onClick = onClick,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleMentionsOnly = onToggleMentionsOnly,
            onToggleArchive = onToggleArchive,
            onLeaveConversation = onLeaveConversation,
            onDeleteForMe = onDeleteForMe,
            onDeleteForAll = onDeleteForAll,
            onRename = onRename,
            currentCustomName = prefs?.customName,
            onSetReaction = onSetReaction,
            currentReaction = prefs?.reaction,
            onSetTags = onSetTags,
            currentTags = prefs?.tags.orEmpty(),
            onMarkRead = onMarkRead,
            onMarkUnread = onMarkUnread,
            onDiscardDraft = onDiscardDraft,
            onAssignCategory = onAssignCategory,
            onCreateCategory = onCreateCategory,
            onLoadPreview = onLoadPreview,
            isLocked = isLocked,
            onLockToggle = onLockToggle,
        )
    }
}

/**
 * The conversation row's trailing timestamp as a compact relative label ("5 min", "2 h", "3 j",
 * …) — the Android parity of iOS `ThemedConversationRow`'s
 * `RelativeTimeFormatter.shortString(for: conversation.lastMessageAt)`. Returns null when the
 * conversation carries no parseable timestamp, so a brand-new row with no activity shows no label
 * rather than a placeholder. The [rememberRelativeTimeStrings] read stays before the early return
 * to keep the composable-call graph unconditional.
 */
@Composable
private fun conversationRowRelativeTime(conversation: ApiConversation): String? {
    val strings = rememberRelativeTimeStrings()
    val millis = ConversationRowTime.epochMillis(conversation) ?: return null
    return RelativeTimeFormat.short(
        epochMillis = millis,
        referenceMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        strings = strings,
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
private fun ConversationRowContent(
    conversation: ApiConversation,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    presence: PresenceState?,
    storyRing: StoryRingState,
    moodEmoji: String?,
    draft: ConversationDraft?,
    typingDisplayName: String?,
    isPinned: Boolean,
    isMuted: Boolean,
    mentionsOnly: Boolean,
    isArchived: Boolean,
    categories: List<CategoryOption>,
    currentCategoryId: String?,
    previewMessages: List<LocalMessage>?,
    onClick: () -> Unit,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleMentionsOnly: () -> Unit,
    onToggleArchive: () -> Unit,
    onLeaveConversation: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForAll: () -> Unit,
    onRename: (String) -> Unit,
    currentCustomName: String?,
    onSetReaction: (String?) -> Unit,
    currentReaction: String?,
    onSetTags: (List<String>) -> Unit,
    currentTags: List<String>,
    onMarkRead: () -> Unit,
    onMarkUnread: () -> Unit,
    onDiscardDraft: () -> Unit,
    onAssignCategory: (String) -> Unit,
    onCreateCategory: (String) -> Unit,
    onLoadPreview: () -> Unit,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
) {
    val title = conversation.displayTitle(currentUserId)
    val isCreator = conversation.currentUserRole(currentUserId) == MemberRole.CREATOR
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
        expired = stringResource(R.string.conversations_preview_expired),
        hidden = stringResource(R.string.conversations_preview_hidden),
        viewOnce = stringResource(R.string.conversations_preview_view_once),
    )
    val draftLine = draftPreview(draft, previewLabels)
    val typingLine = typingPreview(
        typingDisplayName,
        stringResource(R.string.conversations_preview_typing),
    )
    val rowPreview = conversationRowPreview(
        typingLine = typingLine,
        draftLine = draftLine,
        summary = messageSummaryLine(
            message = conversation.lastMessage,
            currentUserId = currentUserId,
            showSender = conversation.type != "direct",
            labels = previewLabels,
            nowMillis = System.currentTimeMillis(),
            // Prisme Linguistique on the row itself. The hard-press preview card two
            // hundred lines below already resolved it per message from this very
            // `currentUserPrefs`; the row behind it rendered the sender's language.
            // `null` prefs (session not hydrated yet) ⇒ empty prism ⇒ the raw preview,
            // which is exactly what the row showed before.
            resolvedContent = conversation.resolvedLastMessagePreview(
                currentUserPrefs
                    ?.let(LanguageResolver::preferredContentLanguages)
                    .orEmpty(),
            ),
        ),
    )
    // Deterministic per-conversation palette — computed once so the avatar's primary fill
    // and the row's heat-gradient tint (secondary → primary, parity iOS `heatBackground`)
    // never re-derive it. Pre-parsed hex → Color, so the row body reads plain Color values.
    val palette = remember(conversation) { conversation.accentColorPalette() }
    val primaryAccent = hexColor(palette.primary)
    val secondaryAccent = hexColor(palette.secondary)
    val heat = ConversationActivityHeat.of(conversation, System.currentTimeMillis())
    val gradient = ConversationActivityHeat.gradient(heat, isDark = MeeshyTheme.isDark)
    val heatBrush = Brush.linearGradient(
        colors = listOf(
            primaryAccent.copy(alpha = gradient.topOpacity),
            secondaryAccent.copy(alpha = gradient.bottomOpacity),
        ),
    )
    Box {
        MeeshyGlassSurface(
            shape = RoundedCornerShape(MeeshyRadius.xl),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = {
                        onLoadPreview()
                        menuExpanded = true
                    },
                )
                .semantics { role = Role.Button; contentDescription = title },
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(heatBrush)
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
            MeeshyAvatar(
                name = title,
                containerColor = primaryAccent,
                presence = presence,
                storyRing = storyRing,
                moodEmoji = moodEmoji,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = MeeshySpacing.md),
            ) {
                ConversationTagsRow(currentTags)
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
                    if (isLocked) {
                        Icon(
                            imageVector = Icons.Filled.Lock,
                            contentDescription = stringResource(R.string.conversations_badge_locked),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier
                                .size(14.dp)
                                .padding(start = MeeshySpacing.xs),
                        )
                    }
                }
                ConversationRowPreviewLine(
                    preview = rowPreview,
                    primaryAccent = primaryAccent,
                )
            }
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                conversationRowRelativeTime(conversation)?.let { relativeTime ->
                    Text(
                        text = relativeTime,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (conversation.unreadCount > 0) {
                            MeeshyTheme.tokens.error
                        } else {
                            primaryAccent
                        },
                        maxLines = 1,
                    )
                }
                if (conversation.unreadCount > 0) {
                    Badge { Text(conversation.unreadCount.coerceAtMost(99).toString()) }
                }
            }
            }
        }

        ConversationContextMenu(
            expanded = menuExpanded,
            onDismiss = { menuExpanded = false },
            title = title,
            isPinned = isPinned,
            isMuted = isMuted,
            mentionsOnly = mentionsOnly,
            isArchived = isArchived,
            hasUnread = conversation.unreadCount > 0,
            hasDraft = draft?.isMeaningful == true,
            categories = categories,
            currentCategoryId = currentCategoryId,
            previewMessages = previewMessages,
            previewShowSender = conversation.type != "direct",
            currentUserId = currentUserId,
            currentUserPrefs = currentUserPrefs,
            previewLabels = previewLabels,
            isCreator = isCreator,
            onTogglePin = onTogglePin,
            onToggleMute = onToggleMute,
            onToggleMentionsOnly = onToggleMentionsOnly,
            onToggleArchive = onToggleArchive,
            onLeaveConversation = onLeaveConversation,
            onDeleteForMe = onDeleteForMe,
            onDeleteForAll = onDeleteForAll,
            onRename = onRename,
            currentCustomName = currentCustomName,
            onSetReaction = onSetReaction,
            currentReaction = currentReaction,
            onSetTags = onSetTags,
            currentTags = currentTags,
            onMarkRead = onMarkRead,
            onMarkUnread = onMarkUnread,
            onDiscardDraft = onDiscardDraft,
            onAssignCategory = onAssignCategory,
            onCreateCategory = onCreateCategory,
            isLocked = isLocked,
            onLockToggle = onLockToggle,
        )
    }
}

/**
 * Conversation-row tag chips with a width-based "+N" overflow badge — parity iOS
 * `ThemedConversationRow.tagsRow`. The fit decision is the pure [ConversationTagRow];
 * this Composable only supplies the real available width (via [BoxWithConstraints],
 * an improvement over iOS's hardcoded 200pt estimate) and paints the chips. Each
 * chip's colour is the deterministic [DynamicColorGenerator.colorForName] so the same
 * tag name reads the same colour everywhere.
 */
/**
 * Kind-aware preview line — the Compose surface for [RowPreview.kind]. Standard
 * typing/draft/last-message text renders as before (accent when live-activity,
 * secondary otherwise). Expired/hidden/view-once messages render italic with a
 * kind icon and a muted or accent tint that mirrors iOS
 * `ThemedConversationRow.lastMessagePreviewView`. Ephemeral-active shows the same
 * body text with a leading timer badge so a still-readable ephemeral is obvious.
 *
 * Compose glue — the kind classification (pure) is covered by [MessageSummaryKindTest]
 * / [MessageSummaryLineTest] / [ConversationRowPreviewKindTest]; the visual mapping
 * here is testable-exempt Compose per `TDD-COVERAGE.md`.
 */
@Composable
private fun ConversationRowPreviewLine(
    preview: RowPreview,
    primaryAccent: Color,
) {
    val bodySmall = MaterialTheme.typography.bodySmall
    val textSecondary = MeeshyTheme.tokens.textSecondary
    val textMuted = MeeshyTheme.tokens.textSecondary.copy(alpha = 0.65f)
    val standardColor = if (preview.isAccent) primaryAccent else textSecondary

    val (icon, contentDescriptionRes, tint, italic) = when (preview.kind) {
        MessageSummaryKind.EXPIRED -> RowPreviewKindStyle(
            icon = Icons.Filled.HourglassEmpty,
            contentDescriptionRes = R.string.conversations_preview_expired_content_description,
            tint = textMuted,
            italic = true,
        )
        MessageSummaryKind.HIDDEN -> RowPreviewKindStyle(
            icon = Icons.Filled.VisibilityOff,
            contentDescriptionRes = R.string.conversations_preview_hidden_content_description,
            tint = textSecondary,
            italic = true,
        )
        MessageSummaryKind.VIEW_ONCE -> RowPreviewKindStyle(
            icon = Icons.Filled.LocalFireDepartment,
            contentDescriptionRes = R.string.conversations_preview_view_once_content_description,
            tint = primaryAccent,
            italic = true,
        )
        MessageSummaryKind.EPHEMERAL_ACTIVE -> RowPreviewKindStyle(
            icon = Icons.Filled.Timer,
            contentDescriptionRes = R.string.conversations_preview_ephemeral_content_description,
            tint = standardColor,
            italic = false,
        )
        MessageSummaryKind.STANDARD -> RowPreviewKindStyle(
            icon = null,
            contentDescriptionRes = null,
            tint = standardColor,
            italic = false,
        )
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescriptionRes?.let { stringResource(it) },
                tint = tint,
                modifier = Modifier
                    .size(14.dp)
                    .padding(end = MeeshySpacing.xs),
            )
        }
        Text(
            text = preview.text,
            style = bodySmall,
            color = tint,
            fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private data class RowPreviewKindStyle(
    val icon: androidx.compose.ui.graphics.vector.ImageVector?,
    val contentDescriptionRes: Int?,
    val tint: Color,
    val italic: Boolean,
)

@Composable
private fun ConversationTagsRow(tags: List<String>) {
    if (tags.isEmpty()) return
    BoxWithConstraints {
        val fit = ConversationTagRow.fit(tags, maxWidth.value.toDouble())
        Row(
            modifier = Modifier.padding(bottom = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            fit.visible.forEach { tag -> ConversationTagChip(tag) }
            if (fit.remaining > 0) {
                Text(
                    text = stringResource(R.string.conversations_row_tags_overflow, fit.remaining),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(MeeshyTheme.tokens.textSecondary.copy(alpha = 0.10f))
                        .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun ConversationTagChip(tag: String) {
    val color = hexColor(DynamicColorGenerator.colorForName(tag))
    Text(
        text = tag,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = MeeshySpacing.sm, vertical = 2.dp),
    )
}

/** Fixed favorite-reaction choices — parity iOS `ConversationListView+Overlays`'s "Favori" submenu. */
private val favoriteReactionChoices = listOf("⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡")

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ConversationContextMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    title: String,
    isPinned: Boolean,
    isMuted: Boolean,
    mentionsOnly: Boolean,
    isArchived: Boolean,
    hasUnread: Boolean,
    hasDraft: Boolean,
    categories: List<CategoryOption>,
    currentCategoryId: String?,
    previewMessages: List<LocalMessage>?,
    previewShowSender: Boolean,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    previewLabels: LastMessagePreviewLabels,
    isCreator: Boolean,
    onTogglePin: () -> Unit,
    onToggleMute: () -> Unit,
    onToggleMentionsOnly: () -> Unit,
    onToggleArchive: () -> Unit,
    onLeaveConversation: () -> Unit,
    onDeleteForMe: () -> Unit,
    onDeleteForAll: () -> Unit,
    onRename: (String) -> Unit,
    currentCustomName: String?,
    onSetReaction: (String?) -> Unit,
    currentReaction: String?,
    onSetTags: (List<String>) -> Unit,
    currentTags: List<String>,
    onMarkRead: () -> Unit,
    onMarkUnread: () -> Unit,
    onDiscardDraft: () -> Unit,
    onAssignCategory: (String) -> Unit,
    onCreateCategory: (String) -> Unit,
    isLocked: Boolean,
    onLockToggle: () -> Unit,
) {
    var showLeaveConfirm by remember(expanded) { mutableStateOf(false) }
    var showDeleteForMeConfirm by remember(expanded) { mutableStateOf(false) }
    var showDeleteForAllConfirm by remember(expanded) { mutableStateOf(false) }
    var showRenameDialog by remember(expanded) { mutableStateOf(false) }
    var renameText by remember(expanded) { mutableStateOf(currentCustomName.orEmpty()) }
    var showTagsDialog by remember(expanded) { mutableStateOf(false) }
    var editedTags by remember(expanded) { mutableStateOf(currentTags) }
    var newTagText by remember(expanded) { mutableStateOf("") }
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        ConversationPreviewCard(
            title = title,
            isPinned = isPinned,
            isMuted = isMuted,
            messages = previewMessages,
            showSender = previewShowSender,
            currentUserId = currentUserId,
            currentUserPrefs = currentUserPrefs,
            labels = previewLabels,
        )
        HorizontalDivider()
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
        // Mentions-only is meaningless while fully muted (parity iOS
        // `ConversationPreferencesTab`'s `isEnabled: !isMuted` gate on the same
        // toggle) — hidden rather than disabled: this menu has no established
        // pattern for a disabled row, whereas conditional visibility is already
        // used below for hasUnread/hasDraft.
        if (!isMuted) {
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            if (mentionsOnly) R.string.conversations_action_all_notifications
                            else R.string.conversations_action_mentions_only,
                        ),
                    )
                },
                leadingIcon = { Icon(Icons.Filled.AlternateEmail, contentDescription = null) },
                onClick = { onToggleMentionsOnly(); onDismiss() },
            )
        }
        if (hasUnread) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_mark_read)) },
                leadingIcon = { Icon(Icons.Filled.MarkChatRead, contentDescription = null) },
                onClick = { onMarkRead(); onDismiss() },
            )
        } else {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_mark_unread)) },
                leadingIcon = { Icon(Icons.Filled.MarkChatUnread, contentDescription = null) },
                onClick = { onMarkUnread(); onDismiss() },
            )
        }
        if (hasDraft) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_discard_draft)) },
                leadingIcon = { Icon(Icons.Filled.DeleteSweep, contentDescription = null) },
                onClick = { onDiscardDraft(); onDismiss() },
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
        // Lock / unlock (parity iOS `ConversationLockSheet`): opens the PIN sheet
        // in the ViewModel-resolved mode (unlock a locked row, prompt for a code
        // on an unlocked one, or run first-time master-PIN setup then chain into
        // the code). The row's lock glyph re-derives from the store's live flow.
        DropdownMenuItem(
            text = {
                Text(
                    stringResource(
                        if (isLocked) R.string.conversations_action_unlock
                        else R.string.conversations_action_lock,
                    ),
                )
            },
            leadingIcon = {
                Icon(
                    if (isLocked) Icons.Filled.LockOpen else Icons.Filled.Lock,
                    contentDescription = null,
                )
            },
            onClick = { onLockToggle(); onDismiss() },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_rename)) },
            leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
            onClick = { showRenameDialog = true },
        )
        // Favorite reaction (parity iOS `ConversationListView+Overlays`'s "Favori"
        // menu): a fixed 8-emoji set — no full picker, matching iOS exactly — plus
        // a conditional "Remove favorite" row shown only once one is set. Drives
        // the ConversationFilter.FAVORITES tab, which was previously unreachable
        // (nothing wrote ApiConversationPreferences.reaction).
        HorizontalDivider()
        Text(
            text = stringResource(R.string.conversations_action_favorite),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            favoriteReactionChoices.forEach { emoji ->
                val setLabel = stringResource(R.string.conversations_favorite_set_content_description, emoji)
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(CircleShape)
                        .clickable { onSetReaction(emoji); onDismiss() }
                        .semantics { contentDescription = setLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = emoji, fontSize = 18.sp)
                }
            }
        }
        if (!currentReaction.isNullOrBlank()) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_remove_favorite)) },
                leadingIcon = { Icon(Icons.Filled.Close, contentDescription = null) },
                onClick = { onSetReaction(null); onDismiss() },
            )
        }
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_tags)) },
            leadingIcon = { Icon(Icons.AutoMirrored.Filled.Label, contentDescription = null) },
            onClick = { showTagsDialog = true },
        )
        // Move-to-category / create-category (parity iOS `CategoryPickerField` +
        // `ConversationOptionsViewModel.setCategory`/`createCategoryAndSelect`): a
        // search field filters the pure ConversationCategoryPicker SSOT's displayed
        // list (every category but the current one), and a "Create …" row appears
        // whenever the trimmed query matches no known category name. Always shown
        // (not gated on a non-empty catalogue) so a user with zero categories can
        // create their first one from here. Idempotency on selecting an existing
        // category is enforced by ConversationCategoryReassignment in the ViewModel.
        var categoryQuery by remember(expanded) { mutableStateOf("") }
        val picker = ConversationCategoryPicker.resolve(categories, currentCategoryId, categoryQuery)
        HorizontalDivider()
        Text(
            text = stringResource(R.string.conversations_action_move_to_category),
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
        )
        TextField(
            value = categoryQuery,
            onValueChange = { categoryQuery = it },
            singleLine = true,
            placeholder = { Text(stringResource(R.string.conversations_category_search_hint)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            colors = TextFieldDefaults.colors(
                unfocusedContainerColor = MeeshyTheme.tokens.backgroundTertiary,
                focusedContainerColor = MeeshyTheme.tokens.backgroundTertiary,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
        if (picker.canCreate) {
            DropdownMenuItem(
                text = {
                    Text(
                        stringResource(
                            R.string.conversations_action_create_category,
                            categoryQuery.trim(),
                        ),
                    )
                },
                leadingIcon = { Icon(Icons.Filled.Add, contentDescription = null) },
                onClick = { onCreateCategory(categoryQuery.trim()); onDismiss() },
            )
        }
        picker.displayed.forEach { category ->
            DropdownMenuItem(
                text = { Text(category.name) },
                leadingIcon = { Icon(Icons.Filled.Folder, contentDescription = null) },
                onClick = { onAssignCategory(category.id); onDismiss() },
            )
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_leave)) },
            leadingIcon = {
                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
            },
            onClick = { showLeaveConfirm = true },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.conversations_action_delete_for_me)) },
            leadingIcon = { Icon(Icons.Filled.DeleteForever, contentDescription = null) },
            onClick = { showDeleteForMeConfirm = true },
        )
        if (isCreator) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_action_delete_for_all)) },
                leadingIcon = { Icon(Icons.Filled.DeleteForever, contentDescription = null) },
                onClick = { showDeleteForAllConfirm = true },
            )
        }
    }

    if (showLeaveConfirm) {
        AlertDialog(
            onDismissRequest = { showLeaveConfirm = false },
            title = { Text(stringResource(R.string.conversations_leave_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_leave_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLeaveConfirm = false
                        onLeaveConversation()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_leave_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showLeaveConfirm = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showDeleteForMeConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteForMeConfirm = false },
            title = { Text(stringResource(R.string.conversations_delete_for_me_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_delete_for_me_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteForMeConfirm = false
                        onDeleteForMe()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_delete_for_me_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteForMeConfirm = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showDeleteForAllConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteForAllConfirm = false },
            title = { Text(stringResource(R.string.conversations_delete_for_all_confirm_title)) },
            text = { Text(stringResource(R.string.conversations_delete_for_all_confirm_message, title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteForAllConfirm = false
                        onDeleteForAll()
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_delete_for_all_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteForAllConfirm = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showRenameDialog) {
        AlertDialog(
            onDismissRequest = { showRenameDialog = false },
            title = { Text(stringResource(R.string.conversations_rename_dialog_title)) },
            text = {
                TextField(
                    value = renameText,
                    onValueChange = { renameText = it },
                    singleLine = true,
                    label = { Text(stringResource(R.string.conversations_rename_field_label)) },
                    placeholder = { Text(title) },
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRenameDialog = false
                        onRename(renameText)
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_rename_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showRenameDialog = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }

    if (showTagsDialog) {
        AlertDialog(
            onDismissRequest = { showTagsDialog = false },
            title = { Text(stringResource(R.string.conversations_tags_dialog_title)) },
            text = {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        TextField(
                            value = newTagText,
                            onValueChange = { newTagText = it },
                            singleLine = true,
                            placeholder = { Text(stringResource(R.string.conversations_tags_field_hint)) },
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(
                            onClick = {
                                editedTags = ConversationTagsEditor.add(editedTags, newTagText)
                                newTagText = ""
                            },
                        ) {
                            Icon(
                                Icons.Filled.Add,
                                contentDescription = stringResource(R.string.conversations_tags_add_content_description),
                            )
                        }
                    }
                    FlowRow(
                        modifier = Modifier.padding(top = MeeshySpacing.sm),
                        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                    ) {
                        editedTags.forEach { tag ->
                            InputChip(
                                selected = false,
                                onClick = {},
                                label = { Text(tag) },
                                trailingIcon = {
                                    Icon(
                                        Icons.Filled.Close,
                                        contentDescription = stringResource(
                                            R.string.conversations_tags_remove_content_description,
                                            tag,
                                        ),
                                        modifier = Modifier
                                            .size(16.dp)
                                            .clickable { editedTags = ConversationTagsEditor.remove(editedTags, tag) },
                                    )
                                },
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showTagsDialog = false
                        onSetTags(editedTags)
                        onDismiss()
                    },
                ) {
                    Text(stringResource(R.string.conversations_rename_confirm_button))
                }
            },
            dismissButton = {
                TextButton(onClick = { showTagsDialog = false }) {
                    Text(stringResource(R.string.conversations_leave_cancel_button))
                }
            },
        )
    }
}

/**
 * Hard-press preview card (iOS parity `ConversationPreviewView`): a compact
 * header (title + pin/mute badges) followed by up to a handful of recent
 * cached messages, one line each — rendered as the FIRST child of the
 * long-press [ConversationContextMenu] so a peek always precedes the action
 * list, mirroring iOS's native `.contextMenu(menuItems:preview:)`. [messages]
 * is `null` while [ConversationListViewModel.loadPreviewMessages] has not
 * resolved yet (a brief loading label); non-null-but-empty once loaded with
 * genuinely no cached history for that conversation.
 */
@Composable
private fun ConversationPreviewCard(
    title: String,
    isPinned: Boolean,
    isMuted: Boolean,
    messages: List<LocalMessage>?,
    showSender: Boolean,
    currentUserId: String?,
    currentUserPrefs: MeeshyUser?,
    labels: LastMessagePreviewLabels,
) {
    Column(
        modifier = Modifier
            .widthIn(max = 280.dp)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
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
        Spacer(Modifier.height(MeeshySpacing.xs))
        when {
            messages == null -> Text(
                text = stringResource(R.string.conversations_preview_loading),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            messages.isEmpty() -> Text(
                text = stringResource(R.string.conversations_no_messages),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
            else -> previewLines(
                recent = messages,
                currentUserId = currentUserId,
                showSender = showSender,
                prefs = currentUserPrefs,
                labels = labels,
            ).forEach { line ->
                Text(
                    text = line,
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(vertical = 1.dp),
                )
            }
        }
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

/**
 * The iconified empty-state card (parity §B): glyph in a tinted disc + title +
 * subtitle + optional retry CTA, laid on a [MeeshyGlassSurface]. The copy/icon
 * choice is the pure [EmptyStateVisual]; this glue only renders it. The error
 * glyph tints red, the others accent-indigo, keeping the palette coherent.
 */
@Composable
private fun EmptyStateCard(visual: EmptyStateVisual, onRetry: () -> Unit) {
    val accent = if (visual.glyph == EmptyStateGlyph.Error) MeeshyPalette.Error else MeeshyPalette.Indigo500
    Box(
        modifier = Modifier.fillMaxSize().padding(MeeshySpacing.xl),
        contentAlignment = Alignment.Center,
    ) {
        MeeshyGlassSurface(shape = RoundedCornerShape(MeeshyRadius.lg)) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(accent.copy(alpha = 0.12f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = visual.glyph.icon(),
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(28.dp),
                    )
                }
                Text(
                    text = stringResource(visual.title.resId()),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = MeeshySpacing.lg),
                )
                visual.subtitle?.let { subtitle ->
                    Text(
                        text = when (subtitle) {
                            is EmptyStateSubtitle.Resource -> stringResource(subtitle.copy.resId())
                            is EmptyStateSubtitle.Literal -> subtitle.text
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyTheme.tokens.textSecondary,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = MeeshySpacing.sm),
                    )
                }
                visual.cta?.let { cta ->
                    Button(onClick = onRetry, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
                        Text(stringResource(cta.resId()))
                    }
                }
            }
        }
    }
}

private fun EmptyStateGlyph.icon() = when (this) {
    EmptyStateGlyph.Error -> Icons.Filled.CloudOff
    EmptyStateGlyph.NoResults -> Icons.Filled.SearchOff
    EmptyStateGlyph.NoConversations -> Icons.AutoMirrored.Filled.Chat
}

private fun ConversationSectionKind.titleRes(): Int = when (this) {
    ConversationSectionKind.PINNED -> R.string.conversations_section_pinned
    // CATEGORY headers render the category's own name (section.title); this
    // resource is only the exhaustive-`when` fallback and is never shown.
    ConversationSectionKind.CATEGORY -> R.string.conversations_section_all
    ConversationSectionKind.ALL -> R.string.conversations_section_all
}

private fun ConversationSectionKind.icon() = when (this) {
    ConversationSectionKind.PINNED -> Icons.Filled.PushPin
    ConversationSectionKind.CATEGORY -> Icons.Filled.Folder
    ConversationSectionKind.ALL -> Icons.AutoMirrored.Filled.Chat
}

private fun ConversationSectionKind.containerColor(): Color = when (this) {
    ConversationSectionKind.PINNED -> MeeshyPalette.Error
    ConversationSectionKind.CATEGORY -> MeeshyPalette.Indigo500
    ConversationSectionKind.ALL -> MeeshyPalette.Indigo500
}

private fun EmptyStateCopy.resId(): Int = when (this) {
    EmptyStateCopy.ErrorTitle -> R.string.conversations_error_title
    EmptyStateCopy.ErrorSubtitle -> R.string.conversations_error_subtitle
    EmptyStateCopy.Retry -> R.string.conversations_retry
    EmptyStateCopy.FilteredTitle -> R.string.conversations_no_results
    EmptyStateCopy.FilteredSubtitle -> R.string.conversations_no_results_subtitle
    EmptyStateCopy.ColdTitle -> R.string.conversations_empty
    EmptyStateCopy.ColdSubtitle -> R.string.conversations_empty_subtitle
}

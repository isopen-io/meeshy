package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NoEncryption
import androidx.compose.material.icons.filled.ManageSearch
import androidx.compose.material.icons.filled.SearchOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.CollapsibleSection
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderActionButton
import me.meeshy.ui.component.chrome.CollapsibleHeaderDefaults
import me.meeshy.ui.component.chrome.CollapsibleHeaderMotion
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.MeeshyGlassSurface
import me.meeshy.ui.component.chrome.ScrollMotionVisibility
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

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
    val searchBarVisible = ConversationSearchBarVisibility.isVisible(
        isSearchActive = state.searchText.isNotBlank(),
        isScrollingDown = isScrollingDown,
    )

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            CollapsibleHeader(
                title = stringResource(R.string.conversations_title),
                scrollProgress = headerScrollProgress,
                actionsVisible = headerActionsVisible,
            ) {
                conversationHeaderActions(state.canUnlockAll, state.hasMasterPin).forEach { action ->
                    when (action) {
                        // A global "unlock all" affordance surfaces only while at least one
                        // conversation is locked (parity iOS Settings, which offers unlock-all
                        // contextually) — tapping it opens the master-PIN sheet that drops
                        // every lock at once. Hidden otherwise, so the header stays quiet in
                        // the common case.
                        ConversationHeaderAction.UNLOCK_ALL -> CollapsibleHeaderActionButton(
                            icon = Icons.Filled.LockOpen,
                            contentDescription = stringResource(R.string.conversations_unlock_all),
                            onClick = viewModel::onUnlockAll,
                            enabled = headerActionsVisible,
                        )
                        // Master-PIN management (parity iOS Settings → change / remove
                        // master PIN). Surfaces only once a master PIN exists; "Remove"
                        // additionally hides while any conversation is locked (see
                        // canRemoveMasterPin).
                        ConversationHeaderAction.LOCK_SECURITY_MENU -> LockSecurityMenu(
                            canChange = state.canChangeMasterPin,
                            canRemove = state.canRemoveMasterPin,
                            onChange = viewModel::onChangeMasterPin,
                            onRemove = viewModel::onRemoveMasterPin,
                            enabled = headerActionsVisible,
                        )
                        ConversationHeaderAction.CREATE_SHARE_LINK -> CollapsibleHeaderActionButton(
                            icon = Icons.Filled.AddLink,
                            contentDescription = stringResource(R.string.conversations_create_share_link),
                            onClick = onOpenShareLinkPicker,
                            enabled = headerActionsVisible,
                        )
                        ConversationHeaderAction.NEW_CONVERSATION -> CollapsibleHeaderActionButton(
                            icon = Icons.Filled.Add,
                            contentDescription = stringResource(R.string.conversations_new),
                            onClick = onNewConversation,
                            enabled = headerActionsVisible,
                        )
                    }
                }
            }
        },
        bottomBar = {
            AnimatedVisibility(visible = searchBarVisible) {
                ConversationSearchBar(
                    query = state.searchText,
                    onQueryChange = viewModel::setSearch,
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
                        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
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
// `internal` depuis #4600 : l'en-tete vit desormais dans son propre fichier, et
// `private` ne franchit pas cette frontiere — la meme que toute extraction fait
// traverser, et qui ne se voit qu'a la compilation.
internal fun LockSecurityMenu(
    canChange: Boolean,
    canRemove: Boolean,
    onChange: () -> Unit,
    onRemove: () -> Unit,
    enabled: Boolean = true,
) {
    var expanded by remember { mutableStateOf(false) }
    CollapsibleHeaderActionButton(
        icon = Icons.Filled.MoreVert,
        contentDescription = stringResource(R.string.conversations_lock_security_menu),
        onClick = { expanded = true },
        enabled = enabled,
    )
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

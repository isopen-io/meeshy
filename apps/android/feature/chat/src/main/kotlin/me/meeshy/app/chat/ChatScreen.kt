package me.meeshy.app.chat

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MessageDeletability
import me.meeshy.sdk.model.MessageEditability
import me.meeshy.sdk.model.MessagePinToggle
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.location.LiveLocationBadge
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    onStartCall: (peerName: String, isVideo: Boolean) -> Unit = { _, _ -> },
    onRejoinCall: (call: ActiveCallSession, peerName: String) -> Unit = { _, _ -> },
    onCreateShareLink: () -> Unit = {},
    /** True when THIS device is already engaged in a live call — suppresses the
     * « Rejoindre » pill so a minimised call viewing its own chat isn't offered
     * to rejoin the call it's already in. */
    hasLocalLiveCall: Boolean = false,
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Re-probe the server for a still-active call each time the screen resumes
    // (returning from the call itself, an app relaunch mid-call) so the
    // « Rejoindre » pill reflects the server truth — appearing when a lost call
    // is still live, clearing once it's over. Parité iOS ConversationView.
    LifecycleResumeEffect(Unit) {
        viewModel.refreshActiveCall()
        onPauseOrDispose { }
    }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // Async OpenGraph link previews: one screen-scoped store dedupes fetches across bubbles and
    // dies with the screen (its cache is discarded on logout/leave — nothing leaks to the next
    // user). Each bubble projects a pure outcome from this collected cache.
    val linkPreviewStore = remember { LinkPreviewStore(scope) }
    val linkPreviewCache by linkPreviewStore.cache.collectAsStateWithLifecycle()
    // [ChatListOrientation.BottomUp]: the list is rendered bottom-anchored
    // (`LazyColumn(reverseLayout = true)` below fed the REVERSED item order)
    // so newest content stays pinned to the bottom edge without any scroll-
    // compensation code — the §C inverted-list rewrite's sub-slice 2 (see
    // `PROGRESS.md`). `listItems` stays oldest-first (the natural,
    // chronological SSOT `buildChatListItems` produces); `renderedItems` is
    // the cheap `asReversed()` VIEW actually fed to the `LazyColumn` and to
    // every pure function below that scrolls/indexes into rendered rows.
    val orientation = ChatListOrientation.BottomUp
    val listItems = remember(state.messages, state.firstUnreadMessageId, state.showEncryptionDisclaimer) {
        buildChatListItems(
            state.messages,
            ZoneId.systemDefault(),
            state.firstUnreadMessageId,
            showEncryptionNotice = state.showEncryptionDisclaimer,
        )
    }
    val renderedItems = remember(listItems) { listItems.asReversed() }

    val replyThreads = remember(state.messages) {
        ReplyThreads.of(state.messages.map { ReplyLink(it.messageId, it.replyToId, it.isDeleted) })
    }

    // One-shot open scroll: the first time the list is populated and the unread
    // boundary has resolved, land on the "new messages" separator if there is
    // one, otherwise on the newest message (bottom). Waiting for the resolution
    // flag keeps the jump from firing against an empty/unsettled window; the
    // latch guarantees the boundary is stable, so this fires exactly once.
    var didOpenScroll by remember { mutableStateOf(false) }
    LaunchedEffect(state.unreadBoundaryResolved, renderedItems) {
        if (didOpenScroll || !state.unreadBoundaryResolved) return@LaunchedEffect
        val target = InitialScrollTarget.of(renderedItems, orientation) ?: return@LaunchedEffect
        listState.scrollToItem(target)
        didOpenScroll = true
    }

    // Auto-scroll on a new message only when the user is already at the
    // bottom — or when the message is their own. Reading history must never
    // be yanked down; the scroll-to-bottom control covers that case.
    LaunchedEffect(state.messages.lastOrNull()?.messageId) {
        if (listItems.isEmpty()) return@LaunchedEffect
        val isOwnMessage = state.messages.lastOrNull()?.isOutgoing == true
        val nearBottom = ChatScrollGeometry.isNearBottom(
            edgeIndex = ChatScrollGeometry.bottomEdgeIndex(
                firstVisibleIndex = listState.firstVisibleItemIndex,
                lastVisibleIndex = listState.lastVisibleItemIndex(),
                orientation = orientation,
            ),
            lastIndex = listItems.lastIndex,
            orientation = orientation,
        )
        if (isOwnMessage || nearBottom) {
            listState.animateScrollToItem(
                ChatScrollGeometry.bottomIndex(listItems.lastIndex, orientation),
            )
        }
    }

    // Jump to the focused search hit whenever it changes (new query, next/prev).
    LaunchedEffect(state.search.activeMessageId) {
        val target = state.search.activeMessageId ?: return@LaunchedEffect
        val index = renderedItems.indexOfFirst { it is ChatListItem.Message && it.bubble.messageId == target }
        if (index >= 0) listState.animateScrollToItem(index)
    }

    // Jump to the quoted original when a reply-preview tap requests it, then consume.
    LaunchedEffect(state.scrollToMessageId) {
        val target = state.scrollToMessageId ?: return@LaunchedEffect
        val index = renderedItems.indexOfFirst { it is ChatListItem.Message && it.bubble.messageId == target }
        if (index >= 0) listState.animateScrollToItem(index)
        viewModel.onScrollHandled()
    }

    val affordanceMessages = remember(state.messages) {
        state.messages.map { it.toAffordanceMessage() }
    }
    val isNearBottom by remember(listItems) {
        derivedStateOf {
            ChatScrollGeometry.isNearBottom(
                edgeIndex = ChatScrollGeometry.bottomEdgeIndex(
                    firstVisibleIndex = listState.firstVisibleItemIndex,
                    lastVisibleIndex = listState.lastVisibleItemIndex(),
                    orientation = orientation,
                ),
                lastIndex = listItems.lastIndex,
                orientation = orientation,
            )
        }
    }
    val pinnedDayMillis by remember(renderedItems) {
        derivedStateOf {
            val topIndex = ChatScrollGeometry.topEdgeIndex(
                firstVisibleIndex = listState.firstVisibleItemIndex,
                lastVisibleIndex = listState.lastVisibleItemIndex(),
                orientation = orientation,
            )
            PinnedDayHeader.governingDayMillis(renderedItems, topIndex, orientation)
        }
    }
    var scrollAffordance by remember { mutableStateOf(ScrollAffordanceState()) }
    var showConversationSettings by remember { mutableStateOf(false) }
    var showMembers by remember { mutableStateOf(false) }
    var showStats by remember { mutableStateOf(false) }
    var showAnalysis by remember { mutableStateOf(false) }
    // Window-space frame of each rendered message row, captured during layout for
    // the long-press preview hero (see MessageOverlayPreviewHero). A plain map, not
    // snapshot state: written from onGloballyPositioned without forcing recomposition,
    // read only when the overlay opens (an actionMessageId change already recomposes).
    val bubbleFrames = remember { mutableMapOf<String, Rect>() }
    val rowActions = remember(viewModel, bubbleFrames) {
        ChatMessageRowActions(
            onReply = { messageId -> viewModel.startReply(messageId) },
            onLongPress = { messageId -> viewModel.onMessageLongPress(messageId) },
            onReactionClick = { messageId, emoji -> viewModel.toggleReaction(messageId, emoji) },
            onReactionLongPress = { messageId -> viewModel.openReactionDetails(messageId) },
            onImageClick = { messageId, index -> viewModel.openImageViewer(messageId, index) },
            onFileClick = { messageId, attachmentId ->
                viewModel.onFileAttachmentOpen(messageId, attachmentId)
            },
            onReplyPreviewClick = { messageId -> viewModel.onReplyPreviewTap(messageId) },
            onFlagTap = { messageId, code -> viewModel.onFlagTap(messageId, code) },
            onReplyCountTap = { messageId -> viewModel.onReplyCountTap(messageId) },
            onReplyCountLongPress = { messageId -> viewModel.openReplyThread(messageId) },
            onRetry = { messageId -> viewModel.retryMessage(messageId) },
            onBubbleFramed = { messageId, frame -> bubbleFrames[messageId] = frame },
        )
    }
    LaunchedEffect(affordanceMessages, isNearBottom) {
        scrollAffordance = ScrollAffordance.next(scrollAffordance, affordanceMessages, isNearBottom)
    }

    LaunchedEffect(listState) {
        snapshotFlow {
            ChatScrollGeometry.topEdgeIndex(
                firstVisibleIndex = listState.firstVisibleItemIndex,
                lastVisibleIndex = listState.lastVisibleItemIndex(),
                orientation = orientation,
            )
        }
            .distinctUntilChanged()
            .collect { index ->
                val nearOldEnd = ChatScrollGeometry.isNearOldEnd(
                    edgeIndex = index,
                    lastIndex = listItems.lastIndex,
                    orientation = orientation,
                )
                if (nearOldEnd) viewModel.loadOlder()
            }
    }


    val accentColor = state.accentColorHex
        ?.let { hexColor(it) }
        ?.takeIf { it != Color.Unspecified }
        ?: MeeshyPalette.Indigo500

    MeeshyBackground {
    Scaffold(
        containerColor = Color.Transparent,
        topBar = {
            if (state.search.isActive) {
                ChatSearchBar(
                    search = state.search,
                    accentColor = accentColor,
                    onQueryChange = viewModel::onSearchQueryChange,
                    onPrevious = viewModel::previousSearchMatch,
                    onNext = viewModel::nextSearchMatch,
                    onClose = viewModel::closeSearch,
                )
            } else {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                        actionIconContentColor = MeeshyPalette.Indigo500,
                    ),
                    title = {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(10.dp)
                                        .clip(CircleShape)
                                        .background(accentColor),
                                )
                                Text(
                                    text = state.conversationTitle ?: stringResource(R.string.chat_title),
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.padding(start = MeeshySpacing.sm),
                                )
                                if (!state.isGroup) {
                                    val presenceColor = meeshyPresenceDotColor(state.headerPresence(System.currentTimeMillis()))
                                    if (presenceColor != null) {
                                        Box(
                                            modifier = Modifier
                                                .padding(start = MeeshySpacing.xs)
                                                .size(8.dp)
                                                .clip(CircleShape)
                                                .background(presenceColor),
                                        )
                                    }
                                }
                            }
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                            ) {
                                TypingAvatarCluster(
                                    stack = TypingAvatarStack.of(state.typingParticipants),
                                    accentColor = accentColor,
                                )
                                ChatHeaderSubtitleRow(
                                    subtitle = ChatHeaderSubtitle.of(
                                        memberCount = state.memberCount,
                                        isGroup = state.isGroup,
                                        typing = state.typingParticipants,
                                    ),
                                    accentColor = accentColor,
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back))
                        }
                    },
                    actions = {
                        val peerName = state.conversationTitle.orEmpty()
                        IconButton(onClick = viewModel::openSearch) {
                            Icon(Icons.Filled.Search, contentDescription = stringResource(R.string.chat_search))
                        }
                        IconButton(onClick = { showStats = true }) {
                            Icon(
                                Icons.Filled.Insights,
                                contentDescription = stringResource(R.string.conversation_stats_title),
                            )
                        }
                        IconButton(onClick = { showAnalysis = true }) {
                            Icon(
                                Icons.Filled.AutoAwesome,
                                contentDescription = stringResource(R.string.conversation_analysis_title),
                            )
                        }
                        if (state.isGroup) {
                            IconButton(onClick = { showMembers = true }) {
                                Icon(
                                    Icons.Filled.Group,
                                    contentDescription = stringResource(R.string.conversation_members_open),
                                )
                            }
                        }
                        // Moderator+ viewers of a group get the admin surfaces: the
                        // share-link creator and the conversation-settings sheet
                        // (write-role / announcement / slow-mode / auto-translate).
                        if (state.slowModeExempt) {
                            if (state.isGroup) {
                                IconButton(onClick = onCreateShareLink) {
                                    Icon(
                                        Icons.Filled.AddLink,
                                        contentDescription = stringResource(R.string.chat_create_share_link),
                                    )
                                }
                            }
                            IconButton(onClick = { showConversationSettings = true }) {
                                Icon(
                                    Icons.Filled.Tune,
                                    contentDescription = stringResource(R.string.conversation_settings_title),
                                )
                            }
                        }
                        val ongoing = state.activeCall
                            ?.takeIf { RejoinPillPolicy.shouldOffer(it, hasLocalLiveCall) }
                        if (ongoing != null) {
                            // An call the local session lost is still live server-side:
                            // offer « Rejoindre » (a tap joins the existing call via the
                            // shared auto-answer path) instead of placing a NEW call.
                            RejoinCallPill(
                                isVideo = ongoing.isVideo,
                                onClick = { onRejoinCall(ongoing, peerName) },
                            )
                        } else {
                            IconButton(onClick = { onStartCall(peerName, false) }) {
                                Icon(Icons.Filled.Call, contentDescription = stringResource(R.string.chat_call_audio))
                            }
                            IconButton(onClick = { onStartCall(peerName, true) }) {
                                Icon(Icons.Filled.Videocam, contentDescription = stringResource(R.string.chat_call_video))
                            }
                        }
                    },
                )
            }
        },
        bottomBar = {
            val replyTarget = state.replyingToMessageId?.let { id ->
                state.messages.firstOrNull { it.messageId == id }
            }
            val pendingTray = viewModel.controllers.find<ComposerTrayController>()
            val pending by (pendingTray?.state ?: NO_PENDING).collectAsStateWithLifecycle()
            Column {
                ComposerPendingStrip(pending.items, onRemove = { pendingTray?.remove(it) })
                MentionSuggestionStrip(
                    mention = state.mention,
                    accentColor = accentColor,
                    onSelect = viewModel::onMentionSelected,
                )
                ChatComposer(
                    draft = state.draft,
                    draftRevision = state.draftRevision,
                    canSend = state.canSend || (!pending.isEmpty && !pending.hasPreparing),
                    hasPendingAttachments = !pending.isEmpty,
                    onPickUris = { pendingTray?.stageUris(it) },
                    isEditing = state.isEditing,
                    affordances = state.composerAffordances,
                    slowMode = rememberComposerSlowMode(state),
                    replyingToLabel = replyTarget?.let { it.senderName ?: it.text.take(40) },
                    hasEffects = state.hasPendingEffects,
                    clipboardContent = state.clipboardContent,
                    sentiment = state.composerSentiment,
                    languageCode = state.composerLanguageCode,
                    accentColor = accentColor,
                    onDraftChange = viewModel::onDraftChange,
                    onPickLanguage = viewModel::onComposerLanguagePicked,
                    onSend = viewModel::send,
                    onOpenEffects = viewModel::openEffectsPicker,
                    onCancelEdit = viewModel::cancelEdit,
                    onCancelReply = viewModel::cancelReply,
                    onRemoveClipboard = viewModel::removeClipboardContent,
                    onPickFile = viewModel::onPickFile,
                )
            }
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                state.showSkeleton -> ChatSkeleton()

                state.messages.isEmpty() && state.errorMessage != null ->
                    ChatNotice(state.errorMessage!!, onRetry = viewModel::refresh)

                state.messages.isEmpty() ->
                    ChatNotice(stringResource(R.string.chat_no_messages), onRetry = null)

                else -> Column(modifier = Modifier.fillMaxSize()) {
                    state.pinnedBanner?.let { banner ->
                        PinnedBannerStrip(
                            banner = banner,
                            accentColor = accentColor,
                            onClick = viewModel::onPinnedBannerTap,
                            onOpenList = viewModel::openPinnedSheet,
                        )
                    }
                    state.liveLocationBadges.forEach { session ->
                        LiveLocationBadge(
                            username = session.username,
                            expiresAtMillis = session.expiresAtMillis,
                            accentColor = state.accentColorHex,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
                        )
                    }
                    ChatMessageList(
                        listState = listState,
                        renderedItems = renderedItems,
                        accentColor = accentColor,
                        isLoadingOlder = state.isLoadingOlder,
                        pinnedDayMillis = pinnedDayMillis,
                        scrollAffordance = scrollAffordance,
                        typingParticipants = state.typingParticipants,
                        isOffline = state.isOffline,
                        onScrollToBottom = {
                            scrollAffordance = ScrollAffordance.next(
                                scrollAffordance,
                                affordanceMessages,
                                isNearBottom = true,
                            )
                            scope.launch {
                                if (listItems.isNotEmpty()) {
                                    listState.animateScrollToItem(
                                        ChatScrollGeometry.bottomIndex(listItems.lastIndex, orientation),
                                    )
                                }
                            }
                        },
                        modifier = Modifier.weight(1f),
                    ) { item ->
                        ChatListRow(
                            item = item,
                            accentColor = accentColor,
                            mentionDisplayNames = state.mentionDisplayNames.ifEmpty { null },
                            highlightTerm = state.search.highlightTerm,
                            replyThreads = replyThreads,
                            linkPreviewStore = linkPreviewStore,
                            linkPreviewCache = linkPreviewCache,
                            actions = rowActions,
                        )
                    }
                    TypingIndicator(participants = state.typingParticipants)
                }
            }
        }
    }

    val gallery = state.imageViewer
    if (gallery != null) {
        val relativeStrings = rememberRelativeTimeStrings()
        val galleryNow = remember(gallery) { System.currentTimeMillis() }
        val galleryZone = ZoneId.systemDefault()
        val galleryLocale = Locale.getDefault()
        val galleryTimestamps = remember(gallery, relativeStrings) {
            gallery.createdAtIsos.map { iso ->
                iso?.let { isoToEpochMillisOrNull(it) }?.let { millis ->
                    RelativeTimeFormat.short(
                        epochMillis = millis,
                        referenceMillis = galleryNow,
                        zone = galleryZone,
                        locale = galleryLocale,
                        strings = relativeStrings,
                    )
                }
            }
        }
        val galleryContext = LocalContext.current
        val savedMessage = stringResource(R.string.image_saved_to_gallery)
        val saveFailedMessage = stringResource(R.string.image_save_failed)
        MeeshyImageViewer(
            imageUrls = gallery.imageUrls,
            initialIndex = gallery.startIndex,
            onDismiss = viewModel::dismissImageViewer,
            captions = gallery.captions,
            authors = gallery.senderNames,
            timestamps = galleryTimestamps,
            thumbnailUrls = gallery.thumbnailUrls,
            altTexts = gallery.altTexts,
            onImageSaved = { result ->
                val message = if (result.isSuccess) savedMessage else saveFailedMessage
                Toast.makeText(galleryContext, message, Toast.LENGTH_SHORT).show()
            },
        )
    }

    val actionTarget = state.actionMessageId?.let { id ->
        state.messages.firstOrNull { it.messageId == id }
    }
    if (actionTarget != null) {
        val nowMillis = System.currentTimeMillis()
        val createdAtMillis = isoToEpochMillisOrNull(actionTarget.createdAtIso)
        bubbleFrames[actionTarget.messageId]?.let { frame ->
            MessageOverlayPreviewHero(
                frame = frame,
                content = actionTarget,
                accentColor = accentColor,
            )
        }
        MessageActionsSheet(
            bubble = actionTarget,
            canEdit = MessageEditability.canEdit(
                isOwn = actionTarget.isOutgoing,
                createdAtMillis = createdAtMillis,
                nowMillis = nowMillis,
            ),
            canDeleteForEveryone = MessageDeletability.canDeleteForEveryone(
                isOwn = actionTarget.isOutgoing,
                createdAtMillis = createdAtMillis,
                nowMillis = nowMillis,
            ),
            pinAction = MessagePinToggle.resolve(
                isDeleted = actionTarget.isDeleted,
                pinnedAtIso = actionTarget.pinnedAtIso,
            ),
            ownReactions = state.ownReactions[actionTarget.messageId] ?: emptySet(),
            quickReactions = state.quickReactions,
            accentColor = accentColor,
            onReact = { emoji -> viewModel.toggleReaction(actionTarget.messageId, emoji) },
            onExpandPicker = { viewModel.openEmojiPicker(actionTarget.messageId) },
            onEdit = { viewModel.startEdit(actionTarget.messageId) },
            onDeleteForEveryone = { viewModel.deleteForEveryone(actionTarget.messageId) },
            onDeleteForMe = { viewModel.deleteForMe(actionTarget.messageId) },
            onReply = { viewModel.startReply(actionTarget.messageId) },
            onForward = { viewModel.openForward(actionTarget.messageId) },
            onPin = { viewModel.togglePin(actionTarget.messageId) },
            onStar = { viewModel.toggleStar(actionTarget.messageId) },
            onToggleOriginal = { viewModel.toggleShowOriginal(actionTarget.messageId) },
            onExploreLanguages = { viewModel.openLanguageExplorer(actionTarget.messageId) },
            onReport = { viewModel.openReport(actionTarget.messageId) },
            onOpenFile = { viewModel.onFileAttachmentOpen(actionTarget.messageId) },
            onShareFile = { viewModel.onFileAttachmentShare(actionTarget.messageId) },
            onDismiss = viewModel::dismissMessageActions,
        )
    }

    FileAttachmentDownloadOverlay(
        download = state.fileDownload,
        onDismiss = viewModel::dismissFileDownload,
        onRetry = { download ->
            val attachmentId = download.attachmentId.takeIf { it.isNotBlank() }
            if (download.openWhenDone) viewModel.onFileAttachmentOpen(download.messageId, attachmentId)
            else viewModel.onFileAttachmentShare(download.messageId, attachmentId)
        },
    )

    if (showConversationSettings) {
        ConversationSettingsSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            onDismiss = { showConversationSettings = false },
        )
    }

    if (showMembers) {
        ConversationMembersSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            onDismiss = { showMembers = false },
        )
    }

    if (showStats) {
        val statsZone = remember { ZoneId.systemDefault() }
        val clientMessages = remember(state.messages) {
            state.messages.filterNot { it.isDeleted }.map { it.toClientStatMessage(statsZone) }
        }
        ConversationStatsSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            clientMessages = clientMessages,
            onDismiss = { showStats = false },
        )
    }

    if (showAnalysis) {
        ConversationAnalysisSheet(
            conversationId = state.conversationId,
            accentColor = accentColor,
            onDismiss = { showAnalysis = false },
        )
    }

    state.reportForm?.let { form ->
        ReportMessageSheet(
            form = form,
            accentColor = accentColor,
            onSelectReason = viewModel::selectReportReason,
            onDetailsChange = viewModel::onReportDetailsChange,
            onSubmit = viewModel::submitReport,
            onDismiss = viewModel::dismissReport,
        )
    }

    val explorerModel = state.languageExplorer
    val explorerMessageId = state.explorerMessageId
    if (explorerModel != null && explorerMessageId != null) {
        MessageLanguageExplorerSheet(
            explorer = explorerModel,
            accentColor = accentColor,
            onSelectLanguage = { code -> viewModel.onFlagTap(explorerMessageId, code) },
            onRetranslate = { code -> viewModel.onExplorerRetranslate(explorerMessageId, code) },
            onDismiss = viewModel::dismissLanguageExplorer,
        )
    }

    val pickerMessageId = state.emojiPickerMessageId
    if (pickerMessageId != null) {
        ModalBottomSheet(
            onDismissRequest = viewModel::dismissEmojiPicker,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            EmojiFullPicker(
                onSelect = { emoji -> viewModel.toggleReaction(pickerMessageId, emoji) },
                accentColor = accentColor,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    val reactionDetails = state.reactionDetails
    if (reactionDetails != null) {
        ModalBottomSheet(
            onDismissRequest = viewModel::closeReactionDetails,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            ReactionDetailsSheet(
                details = reactionDetails,
                accentColor = accentColor,
                onSelectTab = viewModel::selectReactionTab,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    if (state.isPinnedSheetOpen) {
        ModalBottomSheet(
            onDismissRequest = viewModel::closePinnedSheet,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            PinnedMessagesSheet(
                pins = state.pinnedMessages,
                accentColor = accentColor,
                onTap = viewModel::onPinnedMessageTap,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    if (state.isEffectsPickerOpen) {
        ModalBottomSheet(
            onDismissRequest = viewModel::dismissEffectsPicker,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            EffectsPickerSheet(
                effects = state.pendingEffects,
                accentColor = accentColor,
                onToggle = viewModel::toggleEffect,
                onSelectDuration = viewModel::selectEphemeralDuration,
                onClear = viewModel::clearEffects,
                onDone = viewModel::dismissEffectsPicker,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    val replyThread = state.replyThreadOverlay
    if (replyThread != null) {
        ModalBottomSheet(
            onDismissRequest = viewModel::closeReplyThread,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            ReplyThreadSheet(
                overlay = replyThread,
                accentColor = accentColor,
                onReplyTap = viewModel::onReplyThreadReplyTap,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }

    val forward = state.forward
    if (forward != null) {
        ModalBottomSheet(
            onDismissRequest = viewModel::closeForward,
            containerColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            ForwardPickerSheet(
                forward = forward,
                accentColor = accentColor,
                onQueryChange = viewModel::onForwardQueryChange,
                onForwardTo = viewModel::forwardTo,
                modifier = Modifier.navigationBarsPadding(),
            )
        }
    }
    }
}

/**
 * The bytes + display name + declared content-type read back from a picked content Uri.
 * Shared with [me.meeshy.app.chat.ShareTargetScreen] (an inbound `ACTION_SEND` attachment is
 * read through the exact same content-Uri glue as a locally picked one).
 */
internal data class PickedAttachment(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String?,
)

/**
 * Reads a document/photo the user picked from the system picker into memory,
 * resolving its display name and the platform's declared content-type. Returns
 * `null` when the stream cannot be opened (a revoked grant / deleted document) so
 * the composer silently ignores the pick rather than crashing. The byte read and
 * cursor query are the Android-framework glue behind the pure send pipeline.
 */
internal fun readPickedAttachment(context: Context, uri: Uri): PickedAttachment? {
    val resolver = context.contentResolver
    val bytes = runCatching { resolver.openInputStream(uri)?.use { it.readBytes() } }
        .getOrNull() ?: return null
    val fileName = queryDisplayName(resolver, uri) ?: uri.lastPathSegment ?: "attachment"
    return PickedAttachment(bytes = bytes, fileName = fileName, mimeType = resolver.getType(uri))
}

private fun queryDisplayName(resolver: ContentResolver, uri: Uri): String? =
    runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) return@use null
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) cursor.getString(index) else null
        }
    }.getOrNull()

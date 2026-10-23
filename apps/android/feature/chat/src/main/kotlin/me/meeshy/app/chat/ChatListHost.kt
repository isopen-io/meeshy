package me.meeshy.app.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.location.LiveLocationBadge
import me.meeshy.ui.theme.MeeshySpacing

/**
 * List layer: the message list with its scroll behaviours (open scroll, auto-scroll on a new
 * message, search / reply jumps, older-page loading), the pinned banner, live-location badges
 * and the skeleton / notice states. [modifier] carries the Scaffold content padding.
 */
@Composable
internal fun ChatListHost(host: ChatHostContext, modifier: Modifier = Modifier) {
    val state = host.state
    val actions = host.actions
    val accentColor = host.accentColor
    val bubbleFrames = host.bubbleFrames
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // Async OpenGraph link previews: one screen-scoped store dedupes fetches across bubbles and
    // dies with the screen (its cache is discarded on logout/leave — nothing leaks to the next
    // user). Each bubble projects a pure outcome from this collected cache.
    val linkPreviewStore = remember { LinkPreviewStore(scope) }
    val audioPlayer = rememberChatAudioPlayer()
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
        actions.onScrollHandled()
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
    val rowActions = remember(actions, bubbleFrames) {
        ChatMessageRowActions(
            onReply = { messageId -> actions.startReply(messageId) },
            onLongPress = { messageId -> actions.onMessageLongPress(messageId) },
            onReactionClick = { messageId, emoji -> actions.toggleReaction(messageId, emoji) },
            onReactionLongPress = { messageId -> actions.openReactionDetails(messageId) },
            onImageClick = { messageId, index -> actions.openImageViewer(messageId, index) },
            onFileClick = { messageId, attachmentId ->
                actions.onFileAttachmentOpen(messageId, attachmentId)
            },
            onReplyPreviewClick = { messageId -> actions.onReplyPreviewTap(messageId) },
            onFlagTap = { messageId, code -> actions.onFlagTap(messageId, code) },
            onReplyCountTap = { messageId -> actions.onReplyCountTap(messageId) },
            onReplyCountLongPress = { messageId -> actions.openReplyThread(messageId) },
            onRetry = { messageId -> actions.retryMessage(messageId) },
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
                if (nearOldEnd) actions.loadOlder()
            }
    }

    Box(modifier = modifier.fillMaxSize()) {
        when {
            state.showSkeleton -> ChatSkeleton()

            state.messages.isEmpty() && state.errorMessage != null ->
                ChatNotice(state.errorMessage!!, onRetry = actions.refresh)

            state.messages.isEmpty() ->
                ChatNotice(stringResource(R.string.chat_no_messages), onRetry = null)

            else -> Column(modifier = Modifier.fillMaxSize()) {
                state.pinnedBanner?.let { banner ->
                    PinnedBannerStrip(
                        banner = banner,
                        accentColor = accentColor,
                        onClick = actions.onPinnedBannerTap,
                        onOpenList = actions.openPinnedSheet,
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
                        audioPlayer = audioPlayer,
                        isGroup = state.isGroup,
                    )
                }
                TypingIndicator(participants = state.typingParticipants)
            }
        }
    }
}

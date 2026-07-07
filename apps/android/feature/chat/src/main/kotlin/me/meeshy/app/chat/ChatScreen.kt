package me.meeshy.app.chat

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.roundToInt
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.component.bubble.MessageBubble
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    onStartCall: (peerName: String, isVideo: Boolean) -> Unit = { _, _ -> },
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val listItems = remember(state.messages) {
        buildChatListItems(state.messages, ZoneId.systemDefault())
    }

    // Auto-scroll on a new message only when the user is already at the
    // bottom — or when the message is their own. Reading history must never
    // be yanked down; the scroll-to-bottom control covers that case.
    LaunchedEffect(state.messages.lastOrNull()?.messageId) {
        if (listItems.isEmpty()) return@LaunchedEffect
        val isOwnMessage = state.messages.lastOrNull()?.isOutgoing == true
        if (isOwnMessage || listState.isNearBottom(listItems.lastIndex)) {
            listState.animateScrollToItem(listItems.lastIndex)
        }
    }

    // Jump to the focused search hit whenever it changes (new query, next/prev).
    LaunchedEffect(state.search.activeMessageId) {
        val target = state.search.activeMessageId ?: return@LaunchedEffect
        val index = listItems.indexOfFirst { it is ChatListItem.Message && it.bubble.messageId == target }
        if (index >= 0) listState.animateScrollToItem(index)
    }

    // Jump to the quoted original when a reply-preview tap requests it, then consume.
    LaunchedEffect(state.scrollToMessageId) {
        val target = state.scrollToMessageId ?: return@LaunchedEffect
        val index = listItems.indexOfFirst { it is ChatListItem.Message && it.bubble.messageId == target }
        if (index >= 0) listState.animateScrollToItem(index)
        viewModel.onScrollHandled()
    }

    val affordanceMessages = remember(state.messages) {
        state.messages.map { it.toAffordanceMessage() }
    }
    val isNearBottom by remember(listItems) {
        derivedStateOf { listState.isNearBottom(listItems.lastIndex) }
    }
    var scrollAffordance by remember { mutableStateOf(ScrollAffordanceState()) }
    LaunchedEffect(affordanceMessages, isNearBottom) {
        scrollAffordance = ScrollAffordance.next(scrollAffordance, affordanceMessages, isNearBottom)
    }

    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index <= LOAD_OLDER_THRESHOLD) viewModel.loadOlder()
            }
    }

    val accentColor = state.accentColorHex
        ?.let { hexColor(it) }
        ?.takeIf { it != Color.Unspecified }
        ?: MeeshyPalette.Indigo500

    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
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
                    title = {
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
                        IconButton(onClick = { onStartCall(peerName, false) }) {
                            Icon(Icons.Filled.Call, contentDescription = stringResource(R.string.chat_call_audio))
                        }
                        IconButton(onClick = { onStartCall(peerName, true) }) {
                            Icon(Icons.Filled.Videocam, contentDescription = stringResource(R.string.chat_call_video))
                        }
                    },
                )
            }
        },
        bottomBar = {
            val replyTarget = state.replyingToMessageId?.let { id ->
                state.messages.firstOrNull { it.messageId == id }
            }
            Column {
                MentionSuggestionStrip(
                    mention = state.mention,
                    accentColor = accentColor,
                    onSelect = viewModel::onMentionSelected,
                )
                ChatComposer(
                    draft = state.draft,
                    canSend = state.canSend,
                    isEditing = state.isEditing,
                    replyingToLabel = replyTarget?.let { it.senderName ?: it.text.take(40) },
                    accentColor = accentColor,
                    onDraftChange = viewModel::onDraftChange,
                    onSend = viewModel::send,
                    onCancelEdit = viewModel::cancelEdit,
                    onCancelReply = viewModel::cancelReply,
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
                    Box(modifier = Modifier.weight(1f)) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = MeeshySpacing.sm),
                    ) {
                        if (state.isLoadingOlder) {
                            item(key = "loading-older") {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = MeeshySpacing.sm),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        strokeWidth = 2.dp,
                                        color = accentColor,
                                    )
                                }
                            }
                        }
                        items(listItems, key = { it.key }) { item ->
                            when (item) {
                                is ChatListItem.DayHeader -> DaySeparator(item.dayMillis)
                                is ChatListItem.Message -> {
                                    val bubble = item.bubble
                                    SwipeToReplyContainer(
                                        isOutgoing = bubble.isOutgoing,
                                        accentColor = accentColor,
                                        onReply = { viewModel.startReply(bubble.messageId) },
                                    ) {
                                        MessageBubble(
                                            content = bubble,
                                            outgoingColor = accentColor,
                                            mentionDisplayNames = state.mentionDisplayNames.ifEmpty { null },
                                            highlightTerm = state.search.highlightTerm,
                                            onLongPress = {
                                                viewModel.onMessageLongPress(bubble.messageId)
                                            },
                                            onReactionClick = { emoji ->
                                                viewModel.toggleReaction(bubble.messageId, emoji)
                                            },
                                            onImageClick = { index ->
                                                viewModel.openImageViewer(bubble.messageId, index)
                                            },
                                            onReplyPreviewClick = {
                                                viewModel.onReplyPreviewTap(bubble.messageId)
                                            },
                                        )
                                    }
                                    if (bubble.deliveryStatus == DeliveryStatus.Failed) {
                                        Text(
                                            text = stringResource(R.string.chat_send_failed_retry),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.error,
                                            textAlign = TextAlign.End,
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clickable { viewModel.retryMessage(bubble.messageId) }
                                                .padding(
                                                    horizontal = MeeshySpacing.lg,
                                                    vertical = MeeshySpacing.xs,
                                                ),
                                        )
                                    }
                                }
                            }
                        }
                    }
                    ScrollToBottomControl(
                        affordance = scrollAffordance,
                        accentColor = accentColor,
                        onClick = {
                            scrollAffordance = ScrollAffordance.next(
                                scrollAffordance,
                                affordanceMessages,
                                isNearBottom = true,
                            )
                            scope.launch {
                                if (listItems.isNotEmpty()) {
                                    listState.animateScrollToItem(listItems.lastIndex)
                                }
                            }
                        },
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(MeeshySpacing.lg),
                    )
                    }
                    TypingIndicator(typingUsers = state.typingUsers)
                }
            }
        }
    }

    val viewerTarget = state.imageViewer?.let { target ->
        state.messages.firstOrNull { it.messageId == target.messageId }
            ?.takeIf { it.images.isNotEmpty() }
            ?.let { bubble -> bubble.images.map { it.url } to target.imageIndex }
    }
    if (viewerTarget != null) {
        MeeshyImageViewer(
            imageUrls = viewerTarget.first,
            initialIndex = viewerTarget.second,
            onDismiss = viewModel::dismissImageViewer,
        )
    }

    val actionTarget = state.actionMessageId?.let { id ->
        state.messages.firstOrNull { it.messageId == id }
    }
    if (actionTarget != null) {
        MessageActionsSheet(
            bubble = actionTarget,
            ownReactions = state.ownReactions[actionTarget.messageId] ?: emptySet(),
            quickReactions = state.quickReactions,
            accentColor = accentColor,
            onReact = { emoji -> viewModel.toggleReaction(actionTarget.messageId, emoji) },
            onExpandPicker = { viewModel.openEmojiPicker(actionTarget.messageId) },
            onEdit = { viewModel.startEdit(actionTarget.messageId) },
            onDelete = { viewModel.deleteMessage(actionTarget.messageId) },
            onReply = { viewModel.startReply(actionTarget.messageId) },
            onToggleOriginal = { viewModel.toggleShowOriginal(actionTarget.messageId) },
            onDismiss = viewModel::dismissMessageActions,
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
}

private const val LOAD_OLDER_THRESHOLD = 2
private const val BOTTOM_TOLERANCE_ITEMS = 2

private fun LazyListState.isNearBottom(lastIndex: Int): Boolean {
    if (lastIndex <= 0) return true
    val lastVisible = layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
    return lastVisible >= lastIndex - BOTTOM_TOLERANCE_ITEMS
}

/**
 * Wraps a message bubble with the swipe-to-reply gesture. The bubble tracks the
 * finger toward its reply direction (incoming → right, own → left) with the
 * rubber-banded resistance of [SwipeToReply], revealing a reply glyph behind it,
 * and fires [onReply] with a haptic once released past the commit threshold. The
 * "when to arm / when to commit" product decision is the pure [SwipeToReply]
 * core; this is the exempt Compose gesture glue.
 */
@Composable
private fun SwipeToReplyContainer(
    isOutgoing: Boolean,
    accentColor: Color,
    onReply: () -> Unit,
    content: @Composable () -> Unit,
) {
    val direction = replyDirection(isOutgoing)
    val haptic = LocalHapticFeedback.current
    var swipe by remember { mutableStateOf(SwipeReplyState()) }
    var rawTranslation by remember { mutableStateOf(0f) }
    val animatedOffset by animateFloatAsState(
        targetValue = swipe.offset,
        label = "swipe-to-reply-offset",
    )
    val revealProgress = (abs(animatedOffset) / SwipeToReply.COMMIT_THRESHOLD).coerceIn(0f, 1f)

    Box(modifier = Modifier.fillMaxWidth()) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.Reply,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier
                .align(if (isOutgoing) Alignment.CenterEnd else Alignment.CenterStart)
                .padding(horizontal = MeeshySpacing.lg)
                .size(24.dp)
                .alpha(revealProgress),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(animatedOffset.roundToInt(), 0) }
                .pointerInput(direction) {
                    detectHorizontalDragGestures(
                        onDragStart = { rawTranslation = 0f },
                        onDragCancel = {
                            rawTranslation = 0f
                            swipe = SwipeReplyState()
                        },
                        onDragEnd = {
                            if (SwipeToReply.onRelease(swipe, direction) == SwipeReplyRelease.Commit) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                onReply()
                            }
                            rawTranslation = 0f
                            swipe = SwipeReplyState()
                        },
                        onHorizontalDrag = { change, dragAmount ->
                            rawTranslation += dragAmount
                            val drag = SwipeToReply.onDrag(swipe, rawTranslation, direction)
                            if (drag.armedHaptic) {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            }
                            swipe = drag.state
                            change.consume()
                        },
                    )
                },
        ) {
            content()
        }
    }
}

@Composable
private fun DaySeparator(dayMillis: Long, modifier: Modifier = Modifier) {
    val label = MessageDayLabel.label(
        dayMillis = dayMillis,
        nowMillis = System.currentTimeMillis(),
        zone = ZoneId.systemDefault(),
        locale = Locale.getDefault(),
        today = stringResource(R.string.chat_date_today),
        yesterday = stringResource(R.string.chat_date_yesterday),
        dayBeforeYesterday = stringResource(R.string.chat_date_day_before_yesterday),
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.sm),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .background(MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.7f))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        )
    }
}

/**
 * The scroll-to-bottom affordance: a badged FAB that surfaces when the reader has
 * scrolled away, with a live count and a compact preview of the newest unread message
 * (iOS `ConversationScrollControlsView`). Tapping either the pill or the button jumps
 * to the latest and clears the badge. Pure decisions (visibility, count, preview) live
 * in [ScrollAffordance]; this is only the render.
 */
@Composable
private fun ScrollToBottomControl(
    affordance: ScrollAffordanceState,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    androidx.compose.animation.AnimatedVisibility(
        visible = affordance.isVisible,
        modifier = modifier,
    ) {
        Column(horizontalAlignment = Alignment.End) {
            affordance.preview?.let { preview ->
                UnreadPreviewPill(preview = preview, accentColor = accentColor, onClick = onClick)
            }
            BadgedBox(
                badge = {
                    if (affordance.hasUnread) {
                        Badge(containerColor = accentColor, contentColor = MeeshyPalette.White) {
                            Text(unreadBadgeLabel(affordance.unreadCount))
                        }
                    }
                },
            ) {
                SmallFloatingActionButton(
                    onClick = onClick,
                    containerColor = accentColor,
                    contentColor = MeeshyPalette.White,
                ) {
                    Icon(
                        imageVector = Icons.Filled.ArrowDownward,
                        contentDescription = stringResource(R.string.chat_scroll_to_bottom),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun UnreadPreviewPill(
    preview: UnreadPreview,
    accentColor: Color,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(MeeshyRadius.pill),
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier
            .padding(bottom = MeeshySpacing.sm)
            .widthIn(max = 220.dp),
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = MeeshySpacing.md,
                vertical = MeeshySpacing.xs,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        ) {
            unreadPreviewIcon(preview.kind)?.let { icon ->
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(16.dp),
                )
            }
            Column {
                preview.senderName?.let { name ->
                    Text(
                        text = name,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = accentColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = unreadPreviewLabel(preview),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun unreadPreviewIcon(kind: UnreadPreviewKind): ImageVector? = when (kind) {
    UnreadPreviewKind.Image -> Icons.Filled.Image
    UnreadPreviewKind.File -> Icons.Filled.AttachFile
    UnreadPreviewKind.Text -> null
}

@Composable
private fun unreadPreviewLabel(preview: UnreadPreview): String = when {
    preview.text.isNotBlank() -> preview.text
    preview.kind == UnreadPreviewKind.Image -> stringResource(R.string.chat_unread_photo)
    preview.kind == UnreadPreviewKind.File -> stringResource(R.string.chat_unread_attachment)
    else -> stringResource(R.string.chat_unread_new_message)
}

private fun unreadBadgeLabel(count: Int): String = if (count > 99) "99+" else count.toString()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatSearchBar(
    search: ChatSearchState,
    accentColor: Color,
    onQueryChange: (String) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
) {
    TopAppBar(
        navigationIcon = {
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.chat_search_close))
            }
        },
        title = {
            TextField(
                value = search.query,
                onValueChange = onQueryChange,
                singleLine = true,
                placeholder = { Text(stringResource(R.string.chat_search_hint)) },
                modifier = Modifier.fillMaxWidth(),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    cursorColor = accentColor,
                ),
            )
        },
        actions = {
            val term = search.query.isNotBlank()
            if (term) {
                Text(
                    text = if (search.hasMatches) {
                        stringResource(R.string.chat_search_count, search.currentPosition, search.matchCount)
                    } else {
                        stringResource(R.string.chat_search_no_results)
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(horizontal = MeeshySpacing.xs),
                )
                IconButton(onClick = onPrevious, enabled = search.hasMatches) {
                    Icon(Icons.Filled.KeyboardArrowUp, contentDescription = stringResource(R.string.chat_search_previous))
                }
                IconButton(onClick = onNext, enabled = search.hasMatches) {
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = stringResource(R.string.chat_search_next))
                }
            }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageActionsSheet(
    bubble: BubbleContent,
    ownReactions: Set<String>,
    quickReactions: List<String>,
    accentColor: Color,
    onReact: (String) -> Unit,
    onExpandPicker: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onReply: () -> Unit,
    onToggleOriginal: () -> Unit,
    onDismiss: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    val isActionable = !bubble.isDeleted &&
        !bubble.isPending &&
        bubble.deliveryStatus != DeliveryStatus.Failed
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(modifier = Modifier.padding(bottom = MeeshySpacing.xl)) {
            if (isActionable) {
                EmojiQuickStrip(
                    emojis = quickReactions,
                    ownReactions = ownReactions,
                    accentColor = accentColor,
                    onReact = onReact,
                    onExpand = onExpandPicker,
                    modifier = Modifier.padding(
                        horizontal = MeeshySpacing.lg,
                        vertical = MeeshySpacing.sm,
                    ),
                )
                HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)
            }

            if (isActionable) {
                SheetAction(
                    icon = Icons.AutoMirrored.Filled.Reply,
                    label = stringResource(R.string.chat_action_reply),
                    onClick = onReply,
                )
            }
            if (bubble.isTranslated) {
                SheetAction(
                    icon = Icons.Filled.Translate,
                    label = stringResource(
                        if (bubble.isShowingOriginal) R.string.chat_action_show_translation
                        else R.string.chat_action_show_original,
                    ),
                    onClick = onToggleOriginal,
                )
            }
            if (!bubble.isDeleted) {
                SheetAction(
                    icon = Icons.Filled.ContentCopy,
                    label = stringResource(R.string.chat_action_copy),
                    onClick = {
                        clipboard.setText(AnnotatedString(bubble.text))
                        onDismiss()
                    },
                )
            }
            if (bubble.isOutgoing && isActionable) {
                SheetAction(
                    icon = Icons.Filled.Edit,
                    label = stringResource(R.string.chat_action_edit),
                    onClick = onEdit,
                )
                SheetAction(
                    icon = Icons.Filled.Delete,
                    label = stringResource(R.string.chat_action_delete),
                    tint = MaterialTheme.colorScheme.error,
                    onClick = onDelete,
                )
            }
        }
    }
}

@Composable
private fun SheetAction(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = MeeshyTheme.tokens.textPrimary,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .semantics { role = Role.Button }
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Text(text = label, style = MaterialTheme.typography.bodyLarge, color = tint)
    }
}

@Composable
private fun TypingIndicator(typingUsers: List<String>, modifier: Modifier = Modifier) {
    if (typingUsers.isEmpty()) return
    val text = when (typingUsers.size) {
        1 -> stringResource(R.string.chat_typing_one, typingUsers[0])
        2 -> stringResource(R.string.chat_typing_two, typingUsers[0], typingUsers[1])
        else -> stringResource(R.string.chat_typing_many, typingUsers.size)
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
    )
}

/**
 * Autocomplete panel floating above the composer while an `@mention` is in
 * progress. Neutral surface (input-assistance chrome, like the keyboard's suggestion
 * bar) — the accent tint stays reserved for message-content surfaces. Rows are
 * capped and scroll; tapping one inserts the handle via [onSelect].
 */
@Composable
private fun MentionSuggestionStrip(
    mention: MentionAutocompleteState,
    accentColor: Color,
    onSelect: (me.meeshy.sdk.model.MentionCandidate) -> Unit,
) {
    if (!mention.isActive || mention.suggestions.isEmpty()) return
    Surface(
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier.fillMaxWidth(),
    ) {
        LazyColumn(modifier = Modifier.heightIn(max = 200.dp)) {
            items(mention.suggestions, key = { it.id }) { candidate ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(candidate) }
                        .semantics { role = Role.Button }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    MeeshyAvatar(
                        name = candidate.displayName,
                        size = 36.dp,
                        containerColor = accentColor,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = candidate.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MeeshyTheme.tokens.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "@${candidate.username}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatComposer(
    draft: String,
    canSend: Boolean,
    isEditing: Boolean,
    replyingToLabel: String?,
    accentColor: Color,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onCancelEdit: () -> Unit,
    onCancelReply: () -> Unit,
) {
    Surface(color = MeeshyTheme.tokens.backgroundPrimary) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            if (replyingToLabel != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Reply,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = stringResource(R.string.chat_replying_to, replyingToLabel),
                        style = MaterialTheme.typography.labelMedium,
                        color = accentColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = MeeshySpacing.xs),
                    )
                    IconButton(onClick = onCancelReply) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.chat_cancel_reply),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            if (isEditing) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = MeeshySpacing.lg, end = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Edit,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = stringResource(R.string.chat_editing_label),
                        style = MaterialTheme.typography.labelMedium,
                        color = accentColor,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = MeeshySpacing.xs),
                    )
                    IconButton(onClick = onCancelEdit) {
                        Icon(
                            imageVector = Icons.Filled.Close,
                            contentDescription = stringResource(R.string.chat_cancel_edit),
                            tint = MeeshyTheme.tokens.textSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
                    maxLines = 4,
                )
                IconButton(onClick = onSend, enabled = canSend) {
                    Icon(
                        imageVector = if (isEditing) Icons.Filled.Check else Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(R.string.chat_send),
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatSkeleton() {
    Column(modifier = Modifier.fillMaxSize().padding(MeeshySpacing.lg)) {
        repeat(6) { index ->
            MeeshySkeletonBox(
                modifier = Modifier
                    .padding(vertical = MeeshySpacing.sm)
                    .fillMaxWidth(if (index % 2 == 0) 0.6f else 0.45f)
                    .height(36.dp),
            )
        }
    }
}

@Composable
private fun ChatNotice(message: String, onRetry: (() -> Unit)?) {
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
        if (onRetry != null) {
            Button(onClick = onRetry, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
                Text(stringResource(R.string.chat_retry))
            }
        }
    }
}

package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BlurOn
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Celebration
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Gradient
import androidx.compose.material.icons.filled.Grain
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.LooksOne
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material.icons.filled.ZoomOutMap
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.automirrored.filled.Reply
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
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
import androidx.lifecycle.compose.LifecycleResumeEffect
import me.meeshy.sdk.link.LinkPreview
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.sdk.model.call.ActiveCallSession
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.MessageDeletability
import me.meeshy.sdk.model.MessageEditability
import me.meeshy.sdk.model.MessageEffectOption
import me.meeshy.sdk.model.MessageEffectSection
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessageEffectsPickerPresenter
import me.meeshy.sdk.model.MessagePinToggle
import me.meeshy.sdk.model.PinAction
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.component.EmojiFullPicker
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.EmojiQuickStrip
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.component.bubble.LanguageExplorerRow
import me.meeshy.ui.component.bubble.MessageBubble
import me.meeshy.ui.component.bubble.MessageLanguageExplorer
import me.meeshy.ui.component.viewer.MeeshyImageViewer
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.format.RelativeTimeFormat
import me.meeshy.ui.format.rememberRelativeTimeStrings
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
    onRejoinCall: (call: ActiveCallSession, peerName: String) -> Unit = { _, _ -> },
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
    val uriHandler = LocalUriHandler.current
    val listItems = remember(state.messages) {
        buildChatListItems(state.messages, ZoneId.systemDefault())
    }

    val replyThreads = remember(state.messages) {
        ReplyThreads.of(state.messages.map { ReplyLink(it.messageId, it.replyToId, it.isDeleted) })
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
    // Window-space frame of each rendered message row, captured during layout for
    // the long-press preview hero (see MessageOverlayPreviewHero). A plain map, not
    // snapshot state: written from onGloballyPositioned without forcing recomposition,
    // read only when the overlay opens (an actionMessageId change already recomposes).
    val bubbleFrames = remember { mutableMapOf<String, Rect>() }
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
                    hasEffects = state.hasPendingEffects,
                    accentColor = accentColor,
                    onDraftChange = viewModel::onDraftChange,
                    onSend = viewModel::send,
                    onOpenEffects = viewModel::openEffectsPicker,
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
                    state.pinnedBanner?.let { banner ->
                        PinnedBannerStrip(
                            banner = banner,
                            accentColor = accentColor,
                            onClick = viewModel::onPinnedBannerTap,
                            onOpenList = viewModel::openPinnedSheet,
                        )
                    }
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
                                        modifier = Modifier.onGloballyPositioned {
                                            bubbleFrames[bubble.messageId] = it.boundsInWindow()
                                        },
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
                                            onReactionLongPress = {
                                                viewModel.openReactionDetails(bubble.messageId)
                                            },
                                            onImageClick = { index ->
                                                viewModel.openImageViewer(bubble.messageId, index)
                                            },
                                            onLocationClick = { location ->
                                                location.geoUri?.let { runCatching { uriHandler.openUri(it) } }
                                            },
                                            onAudioClick = { audio ->
                                                audio.url?.let { runCatching { uriHandler.openUri(it) } }
                                            },
                                            onReplyPreviewClick = {
                                                viewModel.onReplyPreviewTap(bubble.messageId)
                                            },
                                            onFlagTap = { code ->
                                                viewModel.onFlagTap(bubble.messageId, code)
                                            },
                                        )
                                    }
                                    LinkPreviewCard(
                                        state = LinkPreview.stateFor(
                                            bubble.text,
                                            LinkPreviewOutcome.Empty,
                                        ),
                                        isOutgoing = bubble.isOutgoing,
                                        accentColor = accentColor,
                                        onOpenUrl = { url -> runCatching { uriHandler.openUri(url) } },
                                    )
                                    replyThreads.threadFor(bubble.messageId)?.let { thread ->
                                        ReplyCountPill(
                                            count = thread.count,
                                            isOutgoing = bubble.isOutgoing,
                                            accentColor = accentColor,
                                            onClick = { viewModel.onReplyCountTap(bubble.messageId) },
                                            onLongClick = { viewModel.openReplyThread(bubble.messageId) },
                                        )
                                    }
                                    if (bubble.deliveryStatus == DeliveryStatus.Failed) {
                                        Text(
                                            text = stringResource(R.string.chat_send_failed_retry),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MeeshyPalette.Error,
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
                        typingParticipants = state.typingParticipants,
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
            onDismiss = viewModel::dismissMessageActions,
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

@Composable
private fun ReactionDetailsSheet(
    details: ReactionDetailsUiState,
    accentColor: Color,
    onSelectTab: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_reactions_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )

        val tabs = details.breakdown.tabs
        if (tabs.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                contentPadding = PaddingValues(horizontal = MeeshySpacing.lg),
                modifier = Modifier.fillMaxWidth(),
            ) {
                itemsIndexed(tabs) { index, tab ->
                    val selected = index == details.selectedTabIndex
                    val label = when (tab) {
                        is ReactionTab.All -> stringResource(R.string.chat_reactions_all)
                        is ReactionTab.Emoji -> tab.emoji
                    }
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(MeeshyRadius.pill))
                            .background(
                                if (selected) accentColor.copy(alpha = 0.18f)
                                else MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                            )
                            .clickable { onSelectTab(index) }
                            .semantics { role = Role.Tab }
                            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(text = label, style = MaterialTheme.typography.labelLarge)
                        Text(
                            text = tab.count.toString(),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (selected) accentColor else MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(MeeshySpacing.sm))

        val reactors = details.selectedTab?.reactors.orEmpty()
        when {
            details.isLoading && reactors.isEmpty() ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(MeeshySpacing.xl),
                    contentAlignment = Alignment.Center,
                ) { CircularProgressIndicator(color = accentColor) }

            reactors.isEmpty() ->
                Text(
                    text = stringResource(R.string.chat_reactions_empty),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(
                        horizontal = MeeshySpacing.lg,
                        vertical = MeeshySpacing.lg,
                    ),
                )

            else ->
                LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                    items(reactors, key = { it.userId + it.emoji }) { reactor ->
                        ReactionReactorRow(reactor = reactor, accentColor = accentColor)
                    }
                }
        }
    }
}

@Composable
private fun ReactionReactorRow(reactor: ReactionReactor, accentColor: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        MeeshyAvatar(name = reactor.displayName, size = 36.dp, containerColor = accentColor)
        Text(
            text = if (reactor.isSelf) stringResource(R.string.chat_reactions_you) else reactor.displayName,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(text = reactor.emoji, style = MaterialTheme.typography.titleMedium)
    }
}

private const val LOAD_OLDER_THRESHOLD = 2
private const val BOTTOM_TOLERANCE_ITEMS = 2

/**
 * Seconds of the release velocity to project past the current translation when
 * resolving the overlay drag — the Compose analogue of UIKit's
 * `predictedEndTranslation`. Feeds [MessageOverlayDragLaw.outcome]'s `predicted`.
 */
private const val OVERLAY_DRAG_VELOCITY_PROJECTION_SECONDS = 0.1f

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
    modifier: Modifier = Modifier,
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

    Box(modifier = modifier.fillMaxWidth()) {
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
 * The reply-count pill under a message that has quoted replies (parity with iOS's
 * reply-count affordance). Accent-tinted, aligned to the message's own side, and
 * tappable — tapping jumps to the earliest reply in the thread (no dead end). The
 * "which messages have a thread / how many / which reply anchors it" decision is the
 * pure [ReplyThreads] SSOT; this is only the render.
 */
@Composable
@OptIn(ExperimentalFoundationApi::class)
private fun ReplyCountPill(
    count: Int,
    isOutgoing: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val openThreadLabel = stringResource(R.string.chat_reply_thread_open)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        contentAlignment = if (isOutgoing) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            modifier = Modifier
                .clip(RoundedCornerShape(MeeshyRadius.pill))
                .combinedClickable(
                    onClick = onClick,
                    onLongClick = onLongClick,
                    onLongClickLabel = openThreadLabel,
                )
                .background(accentColor.copy(alpha = 0.12f))
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Reply,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = pluralStringResource(R.plurals.chat_reply_count, count, count),
                style = MaterialTheme.typography.labelMedium,
                color = accentColor,
            )
        }
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
    typingParticipants: List<TypingParticipant>,
    accentColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val content = ScrollControlContent.of(affordance, typingParticipants)
    androidx.compose.animation.AnimatedVisibility(
        visible = content != ScrollControlContent.Hidden,
        modifier = modifier,
    ) {
        Column(horizontalAlignment = Alignment.End) {
            when (content) {
                is ScrollControlContent.Typing ->
                    TypingPill(label = content.label, accentColor = accentColor, onClick = onClick)
                is ScrollControlContent.Unread ->
                    content.preview?.let { preview ->
                        UnreadPreviewPill(preview = preview, accentColor = accentColor, onClick = onClick)
                    }
                else -> Unit
            }
            val badgeCount = (content as? ScrollControlContent.Unread)?.count ?: 0
            BadgedBox(
                badge = {
                    if (badgeCount > 0) {
                        Badge(containerColor = accentColor, contentColor = MeeshyPalette.White) {
                            Text(unreadBadgeLabel(badgeCount))
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TypingPill(label: TypingLabel, accentColor: Color, onClick: () -> Unit) {
    val text = typingLabelText(label) ?: return
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
            Icon(
                imageVector = Icons.Filled.Edit,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(16.dp),
            )
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = accentColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun typingLabelText(label: TypingLabel): String? = when (label) {
    TypingLabel.None -> null
    is TypingLabel.One -> stringResource(R.string.chat_typing_one, label.name)
    is TypingLabel.Two -> stringResource(R.string.chat_typing_two, label.first, label.second)
    is TypingLabel.Many -> stringResource(R.string.chat_typing_many, label.count)
}

@Composable
private fun ChatHeaderSubtitleRow(subtitle: ChatHeaderSubtitle, accentColor: Color) {
    val (text, color) = when (subtitle) {
        ChatHeaderSubtitle.None -> return
        is ChatHeaderSubtitle.Members ->
            stringResource(R.string.chat_header_members, subtitle.count) to
                MeeshyTheme.tokens.textSecondary
        is ChatHeaderSubtitle.Typing ->
            (typingLabelText(subtitle.label) ?: return) to accentColor
    }
    Text(
        text = text,
        style = MaterialTheme.typography.labelSmall,
        color = color,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.padding(start = MeeshySpacing.md),
    )
}

/**
 * Overlapping avatar chips of who is composing, shown in the header beside the typing
 * subtitle (iOS parity — avatars, not just the name). The count and truncation are
 * decided by the pure [TypingAvatarStack]; this only overlaps the chips and renders a
 * "+N" pill for the overflow. Each chip carries a surface-coloured ring so the overlap
 * reads cleanly; avatars degrade to accent-tinted initials.
 */
@Composable
private fun TypingAvatarCluster(stack: TypingAvatarStack, accentColor: Color) {
    if (stack.visible.isEmpty()) return
    val ringColor = MeeshyTheme.tokens.backgroundPrimary
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy((-6).dp),
    ) {
        stack.visible.forEach { chip ->
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(ringColor)
                    .padding(1.5.dp),
            ) {
                MeeshyAvatar(name = chip.name, size = 20.dp, containerColor = accentColor)
            }
        }
        if (stack.overflow > 0) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(ringColor)
                    .padding(1.5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(MeeshyTheme.tokens.backgroundSecondary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = "+${stack.overflow}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PinnedBannerStrip(
    banner: PinnedBanner,
    accentColor: Color,
    onClick: () -> Unit,
    onOpenList: () -> Unit,
) {
    val sender = banner.senderName
        ?: if (banner.isOutgoing) stringResource(R.string.chat_pinned_you) else null
    Surface(
        onClick = onClick,
        color = MeeshyTheme.tokens.backgroundSecondary,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier.padding(
                start = MeeshySpacing.md,
                end = MeeshySpacing.sm,
                top = MeeshySpacing.sm,
                bottom = MeeshySpacing.sm,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Icon(
                imageVector = Icons.Filled.PushPin,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(18.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (banner.count > 1) {
                        stringResource(R.string.chat_pinned_count, banner.count)
                    } else {
                        stringResource(R.string.chat_pinned_title)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = pinnedSnippetLabel(banner.snippet, sender),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (banner.count > 1) {
                IconButton(onClick = onOpenList) {
                    Icon(
                        imageVector = Icons.Filled.KeyboardArrowDown,
                        contentDescription = stringResource(R.string.chat_pinned_sheet_title),
                        tint = accentColor,
                    )
                }
            }
        }
    }
}

@Composable
private fun PinnedMessagesSheet(
    pins: List<PinnedMessageRow>,
    accentColor: Color,
    onTap: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_pinned_sheet_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
            itemsIndexed(pins, key = { _, row -> row.messageId }) { index, row ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                        color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                    )
                }
                val sender = row.senderName
                    ?: if (row.isOutgoing) stringResource(R.string.chat_pinned_you) else null
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onTap(row.messageId) }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                ) {
                    Icon(
                        imageVector = Icons.Filled.PushPin,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        if (sender != null) {
                            Text(
                                text = sender,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = accentColor,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Text(
                            text = pinnedSnippetLabel(row.snippet, sender = null),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MeeshyTheme.tokens.textPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReplyThreadSheet(
    overlay: ReplyThreadOverlayModel,
    accentColor: Color,
    onReplyTap: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_reply_thread_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        ReplyThreadRowContent(
            row = overlay.parent,
            accentColor = accentColor,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        HorizontalDivider(
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
        )
        Text(
            text = pluralStringResource(
                R.plurals.chat_reply_count,
                overlay.replyCount,
                overlay.replyCount,
            ),
            style = MaterialTheme.typography.labelMedium,
            color = accentColor,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
            itemsIndexed(overlay.replies, key = { _, row -> row.messageId }) { index, row ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                        color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                    )
                }
                ReplyThreadRowContent(
                    row = row,
                    accentColor = accentColor,
                    leadingIcon = Icons.AutoMirrored.Filled.Reply,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onReplyTap(row.messageId) }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                )
            }
        }
    }
}

@Composable
private fun ReplyThreadRowContent(
    row: ReplyThreadRow,
    accentColor: Color,
    modifier: Modifier = Modifier,
    leadingIcon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    val sender = row.senderName
        ?: if (row.isOutgoing) stringResource(R.string.chat_pinned_you) else null
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        if (leadingIcon != null) {
            Icon(
                imageVector = leadingIcon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(16.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            if (sender != null) {
                Text(
                    text = sender,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = accentColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                text = replyThreadRowLabel(row),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun replyThreadRowLabel(row: ReplyThreadRow): String = when {
    row.isDeleted -> stringResource(R.string.chat_reply_thread_deleted)
    row.snippet is PinnedSnippet.Text -> (row.snippet as PinnedSnippet.Text).value
    row.snippet == PinnedSnippet.Image -> stringResource(R.string.chat_unread_photo)
    row.snippet == PinnedSnippet.File -> stringResource(R.string.chat_unread_attachment)
    else -> stringResource(R.string.chat_unread_new_message)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ForwardPickerSheet(
    forward: ForwardUiState,
    accentColor: Color,
    onQueryChange: (String) -> Unit,
    onForwardTo: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = MeeshySpacing.lg),
    ) {
        Text(
            text = stringResource(R.string.chat_forward_title),
            style = MaterialTheme.typography.titleMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        )
        OutlinedTextField(
            value = forward.query,
            onValueChange = onQueryChange,
            singleLine = true,
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text(stringResource(R.string.chat_forward_search_hint)) },
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = accentColor,
                cursorColor = accentColor,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        if (forward.targets.isEmpty()) {
            Text(
                text = stringResource(R.string.chat_forward_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.lg),
            )
            return@Column
        }
        LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp)) {
            itemsIndexed(forward.targets, key = { _, t -> t.conversationId }) { index, target ->
                if (index > 0) {
                    HorizontalDivider(
                        modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                        color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                    )
                }
                val sent = target.conversationId in forward.sentConversationIds
                val sending = target.conversationId == forward.sendingConversationId
                val enabled = !sent && forward.sendingConversationId == null
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = enabled) { onForwardTo(target.conversationId) }
                        .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
                ) {
                    MeeshyAvatar(
                        name = target.title,
                        size = 40.dp,
                        containerColor = hexColor(target.accentHex).takeIf { it != Color.Unspecified } ?: accentColor,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = target.title,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MeeshyTheme.tokens.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = if (target.memberCount > 0) {
                                stringResource(R.string.chat_forward_members, target.memberCount)
                            } else {
                                target.type
                            },
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    when {
                        sent -> Icon(
                            imageVector = Icons.Filled.Check,
                            contentDescription = stringResource(R.string.chat_forward_sent),
                            tint = MeeshyPalette.Success,
                            modifier = Modifier.size(24.dp),
                        )
                        sending -> CircularProgressIndicator(
                            color = accentColor,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(22.dp),
                        )
                        else -> Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = stringResource(R.string.chat_forward_send_a11y, target.title),
                            tint = accentColor,
                            modifier = Modifier.size(24.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun pinnedSnippetLabel(snippet: PinnedSnippet, sender: String?): String {
    val body = when (snippet) {
        is PinnedSnippet.Text -> snippet.value
        PinnedSnippet.Image -> stringResource(R.string.chat_unread_photo)
        PinnedSnippet.File -> stringResource(R.string.chat_unread_attachment)
        PinnedSnippet.Empty -> stringResource(R.string.chat_pinned_message)
    }
    return if (sender != null) "$sender: $body" else body
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
    canEdit: Boolean,
    canDeleteForEveryone: Boolean,
    pinAction: PinAction,
    ownReactions: Set<String>,
    quickReactions: List<String>,
    accentColor: Color,
    onReact: (String) -> Unit,
    onExpandPicker: () -> Unit,
    onEdit: () -> Unit,
    onDeleteForEveryone: () -> Unit,
    onDeleteForMe: () -> Unit,
    onReply: () -> Unit,
    onForward: () -> Unit,
    onPin: () -> Unit,
    onStar: () -> Unit,
    onToggleOriginal: () -> Unit,
    onExploreLanguages: () -> Unit,
    onDismiss: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    val ctx = MessageActionContext(
        isDeleted = bubble.isDeleted,
        isPending = bubble.isPending,
        isFailed = bubble.deliveryStatus == DeliveryStatus.Failed,
        isOutgoing = bubble.isOutgoing,
        isTranslated = bubble.isTranslated,
        isShowingOriginal = bubble.isShowingOriginal,
        isStarred = bubble.isStarred,
        canEdit = canEdit,
        canDeleteForEveryone = canDeleteForEveryone,
        pinAction = pinAction,
    )
    // The vertical drag on the grabber is resolved by the pure [MessageOverlayDragLaw]
    // SSOT: a strong swipe up expands the compact action sheet into the full language
    // explorer ("Plus…" / Menu 2), a strong swipe down dismisses, anything weaker
    // springs back. The lift follows the finger via [MessageOverlayDragLaw.displayOffset].
    val scope = rememberCoroutineScope()
    val liftOffset = remember { Animatable(0f) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        dragHandle = {
            OverlayDragHandle(
                accentColor = accentColor,
                onDrag = { translation -> scope.launch { liftOffset.snapTo(MessageOverlayDragLaw.displayOffset(translation)) } },
                onSettle = { scope.launch { liftOffset.animateTo(0f) } },
                onOutcome = { outcome ->
                    when (outcome) {
                        MessageOverlayDragOutcome.OpenMore -> onExploreLanguages()
                        MessageOverlayDragOutcome.Dismiss -> onDismiss()
                        MessageOverlayDragOutcome.SnapBack -> Unit
                    }
                },
            )
        },
    ) {
        Column(
            modifier = Modifier
                .offset { IntOffset(0, liftOffset.value.roundToInt()) }
                .padding(bottom = MeeshySpacing.xl),
        ) {
            if (ctx.isActionable) {
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

            // Interactive audio preview for a playable voice/audio attachment —
            // play/pause, scrubber, ±5s, tap-to-cycle speed — driven by the pure
            // [OverlayMediaTransport]. Mirrors iOS `PreviewAudioPlayer` in the overlay.
            bubble.audios.firstOrNull { it.isPlayable }?.let { audio ->
                OverlayMediaPreview(
                    audio = audio,
                    accentColor = accentColor,
                    modifier = Modifier.padding(
                        horizontal = MeeshySpacing.lg,
                        vertical = MeeshySpacing.sm,
                    ),
                )
                HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)
            }

            // The action grid is composed by the pure [MessageActionMenu] SSOT; this
            // block is a dumb renderer mapping each resolved action to its row.
            MessageActionMenu.actions(ctx).forEach { action ->
                when (action) {
                    MessageAction.Reply -> SheetAction(
                        icon = Icons.AutoMirrored.Filled.Reply,
                        label = stringResource(R.string.chat_action_reply),
                        onClick = onReply,
                    )
                    MessageAction.Forward -> SheetAction(
                        icon = Icons.AutoMirrored.Filled.Send,
                        label = stringResource(R.string.chat_action_forward),
                        onClick = onForward,
                    )
                    MessageAction.ShowOriginal -> SheetAction(
                        icon = Icons.Filled.Translate,
                        label = stringResource(R.string.chat_action_show_original),
                        onClick = onToggleOriginal,
                    )
                    MessageAction.ShowTranslation -> SheetAction(
                        icon = Icons.Filled.Translate,
                        label = stringResource(R.string.chat_action_show_translation),
                        onClick = onToggleOriginal,
                    )
                    MessageAction.ExploreLanguages -> SheetAction(
                        icon = Icons.Filled.Language,
                        label = stringResource(R.string.chat_action_explore_languages),
                        onClick = onExploreLanguages,
                    )
                    MessageAction.Copy -> SheetAction(
                        icon = Icons.Filled.ContentCopy,
                        label = stringResource(R.string.chat_action_copy),
                        onClick = {
                            clipboard.setText(AnnotatedString(bubble.text))
                            onDismiss()
                        },
                    )
                    MessageAction.Pin -> SheetAction(
                        icon = Icons.Filled.PushPin,
                        label = stringResource(R.string.chat_action_pin),
                        onClick = onPin,
                    )
                    MessageAction.Unpin -> SheetAction(
                        icon = Icons.Filled.PushPin,
                        label = stringResource(R.string.chat_action_unpin),
                        onClick = onPin,
                    )
                    MessageAction.Star -> SheetAction(
                        icon = Icons.Filled.BookmarkBorder,
                        label = stringResource(R.string.chat_action_star),
                        onClick = onStar,
                    )
                    MessageAction.Unstar -> SheetAction(
                        icon = Icons.Filled.Bookmark,
                        label = stringResource(R.string.chat_action_unstar),
                        onClick = onStar,
                    )
                    MessageAction.Edit -> SheetAction(
                        icon = Icons.Filled.Edit,
                        label = stringResource(R.string.chat_action_edit),
                        onClick = onEdit,
                    )
                    MessageAction.DeleteForEveryone -> SheetAction(
                        icon = Icons.Filled.Delete,
                        label = stringResource(R.string.chat_action_delete_for_everyone),
                        tint = MeeshyPalette.Error,
                        onClick = onDeleteForEveryone,
                    )
                    MessageAction.DeleteForMe -> SheetAction(
                        icon = Icons.Filled.Delete,
                        label = stringResource(R.string.chat_action_delete_for_me),
                        tint = MeeshyPalette.Error,
                        onClick = onDeleteForMe,
                    )
                }
            }
        }
    }
}

/**
 * The grabber at the top of the long-press overlay sheet. Its vertical drag is
 * governed entirely by the pure [MessageOverlayDragLaw]: [onDrag] streams the
 * damped display offset while the finger moves, [onOutcome] fires the resolved
 * action on release (open "More…", dismiss, or snap back), and [onSettle] springs
 * the lift back to rest. The pill widens and takes the accent colour once the drag
 * arms the "More…" threshold ([MessageOverlayDragLaw.isArmed]) so the gesture reads
 * as intentional before release. All testable decisions live in the pure law; this
 * is coverage-exempt Compose glue.
 */
@Composable
private fun OverlayDragHandle(
    accentColor: Color,
    onDrag: (Float) -> Unit,
    onSettle: () -> Unit,
    onOutcome: (MessageOverlayDragOutcome) -> Unit,
) {
    var armed by remember { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = MeeshySpacing.md)
            .pointerInput(Unit) {
                val tracker = VelocityTracker()
                var accumulated = 0f
                detectVerticalDragGestures(
                    onDragStart = {
                        accumulated = 0f
                        armed = false
                        tracker.resetTracking()
                    },
                    onDragEnd = {
                        val velocityY = tracker.calculateVelocity().y
                        val predicted = accumulated + velocityY * OVERLAY_DRAG_VELOCITY_PROJECTION_SECONDS
                        val outcome = MessageOverlayDragLaw.outcome(accumulated, predicted)
                        armed = false
                        onSettle()
                        onOutcome(outcome)
                    },
                    onDragCancel = {
                        accumulated = 0f
                        armed = false
                        onSettle()
                    },
                    onVerticalDrag = { change, dragAmount ->
                        accumulated += dragAmount
                        tracker.addPosition(change.uptimeMillis, change.position)
                        val nowArmed = MessageOverlayDragLaw.isArmed(accumulated)
                        if (nowArmed != armed) armed = nowArmed
                        onDrag(accumulated)
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .width(if (armed) 48.dp else 32.dp)
                .height(4.dp)
                .clip(CircleShape)
                .background(if (armed) accentColor else MeeshyTheme.tokens.backgroundTertiary),
        )
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

/**
 * The per-message language explorer (Prisme Linguistique — exhaustive view). Lists
 * the original-language banner plus every explorable target language projected by
 * [MessageDetailExplorer]: tap a language to switch the bubble to it, tap the
 * refresh icon to retranslate an existing one, or tap a content-less language to
 * translate it on demand.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MessageLanguageExplorerSheet(
    explorer: MessageLanguageExplorer,
    accentColor: Color,
    onSelectLanguage: (String) -> Unit,
    onRetranslate: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.xl),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            Text(
                text = stringResource(R.string.chat_explorer_title),
                style = MaterialTheme.typography.titleMedium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(vertical = MeeshySpacing.sm),
            )

            val originalColor = explorer.originalInfo?.colorHex
                ?.let(::hexColor)
                ?.takeIf { it != Color.Unspecified }
                ?: accentColor
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(MeeshyRadius.md))
                    .background(originalColor.copy(alpha = 0.08f))
                    .padding(MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                ) {
                    Text(
                        text = explorer.originalInfo?.flag ?: (explorer.originalCode ?: "").uppercase(),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Text(
                        text = stringResource(R.string.chat_explorer_original),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = originalColor,
                    )
                    explorer.originalInfo?.let {
                        Text(
                            text = "· ${it.name}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    }
                }
                if (explorer.originalPreview.isNotEmpty()) {
                    Text(
                        text = explorer.originalPreview,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                }
            }

            HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary)

            explorer.rows.forEach { row ->
                LanguageExplorerRowView(
                    row = row,
                    accentColor = accentColor,
                    onSelect = { onSelectLanguage(row.code) },
                    onRetranslate = { onRetranslate(row.code) },
                )
            }
        }
    }
}

@Composable
private fun LanguageExplorerRowView(
    row: LanguageExplorerRow,
    accentColor: Color,
    onSelect: () -> Unit,
    onRetranslate: () -> Unit,
) {
    val accent = row.info?.colorHex
        ?.let(::hexColor)
        ?.takeIf { it != Color.Unspecified }
        ?: accentColor
    val label = row.info?.name ?: row.code
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .background(if (row.isSelected) accent.copy(alpha = 0.12f) else Color.Transparent)
            .clickable(onClick = onSelect)
            .semantics { role = Role.Button }
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(text = row.info?.flag ?: row.code.uppercase(), style = MaterialTheme.typography.labelLarge)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (row.isSelected) FontWeight.SemiBold else FontWeight.Normal,
            color = if (row.isSelected) accent else MeeshyTheme.tokens.textPrimary,
        )
        Spacer(modifier = Modifier.weight(1f))
        when {
            row.isTranslating -> CircularProgressIndicator(
                color = accent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(18.dp),
            )
            row.hasContent -> {
                row.preview?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textMuted,
                        maxLines = 1,
                        modifier = Modifier.widthIn(max = 160.dp),
                    )
                }
                if (row.canRetranslate) {
                    IconButton(onClick = onRetranslate, modifier = Modifier.size(28.dp)) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = stringResource(R.string.chat_explorer_retranslate),
                            tint = accent.copy(alpha = 0.7f),
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
                if (row.isSelected) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = accent,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            else -> Text(
                text = stringResource(R.string.chat_explorer_translate),
                style = MaterialTheme.typography.labelMedium,
                color = accent,
                modifier = Modifier
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(accent.copy(alpha = 0.12f))
                    .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xs),
            )
        }
    }
}

@Composable
private fun TypingIndicator(participants: List<TypingParticipant>, modifier: Modifier = Modifier) {
    val text = typingLabelText(TypingLabel.of(participants)) ?: return
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
    hasEffects: Boolean,
    accentColor: Color,
    onDraftChange: (String) -> Unit,
    onSend: () -> Unit,
    onOpenEffects: () -> Unit,
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
            var recording by remember { mutableStateOf(VoiceRecordingSession.idle()) }
            LaunchedEffect(recording.isRecording) {
                while (recording.isRecording) {
                    delay(100)
                    recording = recording.tick(0.1)
                }
            }
            if (recording.isRecording) {
                VoiceRecordingPill(
                    session = recording,
                    accentColor = accentColor,
                    onCancel = { recording = recording.cancel() },
                    onStop = { recording = recording.stop().session },
                    onSend = { recording = recording.stop().session },
                    modifier = Modifier.padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                )
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!isEditing) {
                        IconButton(onClick = onOpenEffects) {
                            Icon(
                                imageVector = Icons.Filled.AutoAwesome,
                                contentDescription = stringResource(R.string.chat_effects_open),
                                tint = if (hasEffects) accentColor else MeeshyTheme.tokens.textSecondary,
                            )
                        }
                    }
                    OutlinedTextField(
                        value = draft,
                        onValueChange = onDraftChange,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(stringResource(R.string.chat_message_placeholder)) },
                        maxLines = 4,
                    )
                    if (!isEditing && draft.isBlank()) {
                        IconButton(onClick = { recording = recording.start() }) {
                            Icon(
                                imageVector = Icons.Filled.Mic,
                                contentDescription = stringResource(R.string.chat_record_voice),
                                tint = MeeshyTheme.tokens.textSecondary,
                            )
                        }
                    } else {
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
    }
}

/**
 * Composer effects picker — the thin, coverage-exempt Compose glue over the pure
 * [MessageEffectsPickerPresenter]. Renders the three sections of effect chips, the
 * ephemeral-duration row (only when the presenter says so), and the active summary,
 * forwarding every tap to the ViewModel's [MessageEffectsEditor]-backed intents.
 * Parité iOS `EffectsPickerView` (chips capsule, accent-tinted when active).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EffectsPickerSheet(
    effects: MessageEffects,
    accentColor: Color,
    onToggle: (Long) -> Unit,
    onSelectDuration: (EphemeralDuration) -> Unit,
    onClear: () -> Unit,
    onDone: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val presentation = MessageEffectsPickerPresenter.build(effects)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(max = 520.dp)
            .verticalScroll(rememberScrollState())
            .padding(bottom = MeeshySpacing.xl),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.chat_effects_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.chat_effects_done),
                style = MaterialTheme.typography.labelLarge,
                color = accentColor,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clickable(onClick = onDone).padding(MeeshySpacing.xs),
            )
        }

        presentation.sections.forEach { section ->
            Text(
                text = stringResource(effectSectionLabel(section.section)),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(
                    start = MeeshySpacing.lg,
                    end = MeeshySpacing.lg,
                    top = MeeshySpacing.md,
                    bottom = MeeshySpacing.xs,
                ),
            )
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                section.options.forEach { optionState ->
                    EffectChip(
                        icon = effectIcon(optionState.option),
                        label = stringResource(effectOptionLabel(optionState.option)),
                        isActive = optionState.isActive,
                        accentColor = accentColor,
                        onClick = { onToggle(optionState.option.flag) },
                    )
                }
            }
        }

        if (presentation.showEphemeralDuration) {
            Text(
                text = stringResource(R.string.chat_effects_ephemeral_duration),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(
                    start = MeeshySpacing.lg,
                    end = MeeshySpacing.lg,
                    top = MeeshySpacing.md,
                    bottom = MeeshySpacing.xs,
                ),
            )
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                presentation.ephemeralDurations.forEach { durationState ->
                    EffectChip(
                        icon = null,
                        label = stringResource(ephemeralDurationLabel(durationState.duration)),
                        isActive = durationState.isSelected,
                        accentColor = accentColor,
                        onClick = { onSelectDuration(durationState.duration) },
                    )
                }
            }
        }

        if (presentation.showSummary) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.chat_effects_active_count, presentation.activeCount),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = stringResource(R.string.chat_effects_clear_all),
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.error,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.clickable(onClick = onClear).padding(MeeshySpacing.xs),
                )
            }
        }
    }
}

@Composable
private fun EffectChip(
    icon: ImageVector?,
    label: String,
    isActive: Boolean,
    accentColor: Color,
    onClick: () -> Unit,
) {
    val activeLabel = stringResource(
        if (isActive) R.string.chat_effects_active else R.string.chat_effects_inactive,
    )
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        modifier = Modifier
            .clip(CircleShape)
            .background(
                if (isActive) accentColor.copy(alpha = 0.2f)
                else MeeshyTheme.tokens.backgroundTertiary,
            )
            .border(
                width = 1.dp,
                color = if (isActive) accentColor.copy(alpha = 0.5f) else Color.Transparent,
                shape = CircleShape,
            )
            .clickable(onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = "$label, $activeLabel"
            }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.sm),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isActive) accentColor else MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(16.dp),
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = if (isActive) accentColor else MeeshyTheme.tokens.textSecondary,
        )
    }
}

private fun effectSectionLabel(section: MessageEffectSection): Int = when (section) {
    MessageEffectSection.BEHAVIOR -> R.string.chat_effects_section_behavior
    MessageEffectSection.ENTRY -> R.string.chat_effects_section_entry
    MessageEffectSection.PERMANENT -> R.string.chat_effects_section_permanent
}

private fun effectOptionLabel(option: MessageEffectOption): Int = when (option) {
    MessageEffectOption.EPHEMERAL -> R.string.chat_effect_ephemeral
    MessageEffectOption.BLURRED -> R.string.chat_effect_blurred
    MessageEffectOption.VIEW_ONCE -> R.string.chat_effect_view_once
    MessageEffectOption.SHAKE -> R.string.chat_effect_shake
    MessageEffectOption.ZOOM -> R.string.chat_effect_zoom
    MessageEffectOption.EXPLODE -> R.string.chat_effect_explode
    MessageEffectOption.CONFETTI -> R.string.chat_effect_confetti
    MessageEffectOption.FIREWORKS -> R.string.chat_effect_fireworks
    MessageEffectOption.WAOO -> R.string.chat_effect_waoo
    MessageEffectOption.GLOW -> R.string.chat_effect_glow
    MessageEffectOption.PULSE -> R.string.chat_effect_pulse
    MessageEffectOption.RAINBOW -> R.string.chat_effect_rainbow
    MessageEffectOption.SPARKLE -> R.string.chat_effect_sparkle
}

private fun effectIcon(option: MessageEffectOption): ImageVector = when (option) {
    MessageEffectOption.EPHEMERAL -> Icons.Filled.HourglassEmpty
    MessageEffectOption.BLURRED -> Icons.Filled.BlurOn
    MessageEffectOption.VIEW_ONCE -> Icons.Filled.LooksOne
    MessageEffectOption.SHAKE -> Icons.Filled.Vibration
    MessageEffectOption.ZOOM -> Icons.Filled.ZoomOutMap
    MessageEffectOption.EXPLODE -> Icons.Filled.Grain
    MessageEffectOption.CONFETTI -> Icons.Filled.Celebration
    MessageEffectOption.FIREWORKS -> Icons.Filled.AutoAwesome
    MessageEffectOption.WAOO -> Icons.Filled.Star
    MessageEffectOption.GLOW -> Icons.Filled.WbSunny
    MessageEffectOption.PULSE -> Icons.Filled.Favorite
    MessageEffectOption.RAINBOW -> Icons.Filled.Gradient
    MessageEffectOption.SPARKLE -> Icons.Filled.Bolt
}

private fun ephemeralDurationLabel(duration: EphemeralDuration): Int = when (duration) {
    EphemeralDuration.THIRTY_SECONDS -> R.string.chat_effect_duration_30s
    EphemeralDuration.ONE_MINUTE -> R.string.chat_effect_duration_1m
    EphemeralDuration.FIVE_MINUTES -> R.string.chat_effect_duration_5m
    EphemeralDuration.ONE_HOUR -> R.string.chat_effect_duration_1h
    EphemeralDuration.TWENTY_FOUR_HOURS -> R.string.chat_effect_duration_24h
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

/**
 * Header affordance to rejoin a call the local session lost but that is still
 * live server-side (crash/relaunch mid-call). A green success pill — a tap joins
 * the EXISTING call (adopting its server id via the shared auto-answer path), it
 * never places a new one. Parité iOS pill « Rejoindre » (b69509366).
 */
@Composable
private fun RejoinCallPill(isVideo: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        colors = ButtonDefaults.buttonColors(
            containerColor = MeeshyTheme.tokens.success,
            contentColor = Color.White,
        ),
        contentPadding = PaddingValues(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        modifier = Modifier.padding(end = MeeshySpacing.sm),
    ) {
        Icon(
            imageVector = if (isVideo) Icons.Filled.Videocam else Icons.Filled.Call,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.size(MeeshySpacing.xs))
        Text(
            text = stringResource(R.string.chat_call_rejoin),
            style = MaterialTheme.typography.labelLarge,
        )
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

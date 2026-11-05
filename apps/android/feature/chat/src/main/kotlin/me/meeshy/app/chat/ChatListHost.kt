package me.meeshy.app.chat

import androidx.activity.compose.BackHandler
import me.meeshy.sdk.model.media.MediaPresentation
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import me.meeshy.ui.component.bubble.LocalViewOnceConsumer
import me.meeshy.ui.component.bubble.ViewOnceConsumer
import androidx.compose.ui.Modifier
import android.widget.Toast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import me.meeshy.sdk.model.PlainSignalAdmission
import me.meeshy.sdk.model.selection.MessageSelection
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.reading.mode.ConversationReadingMode
import me.meeshy.app.chat.piece.MessagePieceOverlay
import me.meeshy.ui.component.bubble.LocalBubbleFileTransfers
import me.meeshy.ui.component.permission.rememberPermissionFlow
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.app.chat.piece.PieceOverlayModel
import me.meeshy.app.chat.river.RiverPaneState
import me.meeshy.app.chat.river.RiverScreen
import me.meeshy.sdk.model.reading.river.RiverModeGate
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.sdk.model.reading.focal.ScrollTimePillLaw
import me.meeshy.ui.component.location.LiveLocationBadge
import me.meeshy.ui.component.location.LocationFullscreen
import me.meeshy.ui.component.video.MeeshyVideoViewer
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/**
 * List layer: the message list with its scroll behaviours (open scroll, auto-scroll on a new
 * message, search / reply jumps, older-page loading), the pinned banner, live-location badges
 * and the skeleton / notice states. [modifier] carries the Scaffold content padding.
 */
@Composable
internal fun ChatListHost(
    host: ChatHostContext,
    modifier: Modifier = Modifier,
    topInset: Dp = 0.dp,
    bottomInset: Dp = 0.dp,
) {
    val state = host.state
    val actions = host.actions
    val accentColor = host.accentColor
    val bubbleFrames = host.bubbleFrames
    val listState = rememberLazyListState()
    val expansionHost = rememberLongMessageExpansionHost(listState)
    // La fiche de l'auteur ouverte depuis l'avatar du pied d'identité (iOS `selectedProfileUser`).
    val profileTap = rememberProfileTap(state.conversationId, accentColor, host.viewerRole)
    // L'en-tête efface sa grappe d'actions pendant le défilement (iOS `hiddenWhileScrolling`).
    LaunchedEffect(listState) {
        try {
            snapshotFlow { listState.isScrollInProgress }
                .distinctUntilChanged()
                .collect {
                    host.chrome.listGate?.setScrolling(it)
                    host.chrome.isScrolling = it
                    if (!it) host.chrome.isUserScrolling = false
                }
        } finally {
            host.chrome.listGate?.setScrolling(false)
        }
    }
    // Seul un glissé du doigt arme le défilement « utilisateur » ; il retombe à l'arrêt de l'élan.
    LaunchedEffect(listState) {
        listState.interactionSource.interactions.collect { interaction ->
            if (interaction is DragInteraction.Start) host.chrome.isUserScrolling = true
        }
    }
    // Script / Focal : la rangée plate d'iOS (`FocalRow`) ; Bulles, Résumé, Rivière : la bulle.
    val flatRows = ThreadRowMux.rendering(host.readingMode?.state?.mode) == ThreadRowRendering.Flat
    val scope = rememberCoroutineScope()
    // Async OpenGraph link previews: one screen-scoped store dedupes fetches across bubbles and
    // dies with the screen (its cache is discarded on logout/leave — nothing leaks to the next
    // user). Each bubble projects a pure outcome from this collected cache.
    val linkPreviewStore = remember { LinkPreviewStore(scope) }
    val audioPlayer = LocalChatVoicePlayback.current
    androidx.compose.runtime.SideEffect {
        audioPlayer?.bind(ChatVoiceThread(state.conversationId, state.conversationTitle.orEmpty(), host.header.avatarUrl, accentColor.voiceHex(), state.messages))
    }
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
    val startName = ConversationStartName.of(state.conversationTitle, state.hasMoreOlder, state.showSkeleton)
    val listItems = remember(state.messages, state.firstUnreadMessageId, host.unreadAtOpening, state.showEncryptionDisclaimer, startName) {
        buildChatListItems(
            state.messages,
            ZoneId.systemDefault(),
            state.firstUnreadMessageId,
            showEncryptionNotice = state.showEncryptionDisclaimer,
            conversationStartName = startName,
            serverUnreadCount = host.unreadAtOpening,
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
    // La conversation s'ouvre SUR un message : ramassé une fois, le saut ne se rejoue pas à la prochaine ouverture.
    val landingMessageId = remember { host.takeLandingMessageId() }
    LaunchedEffect(state.unreadBoundaryResolved, renderedItems) {
        if (didOpenScroll || !state.unreadBoundaryResolved) return@LaunchedEffect
        val target = InitialScrollTarget.of(renderedItems, orientation, landingMessageId) ?: return@LaunchedEffect
        listState.scrollToItem(target)
        didOpenScroll = true
    }

    // Auto-scroll on a new message only when the user is already at the
    // bottom — or when the message is their own. Reading history must never
    // be yanked down; the scroll-to-bottom control covers that case.
    LaunchedEffect(state.messages.lastOrNull()?.messageId) {
        // A window anchored on an old message does not end at the present: its last row is no arrival.
        if (listItems.isEmpty() || host.landing.hasMoreNewer) return@LaunchedEffect
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
    // Seuil iOS (`nearBottomFollowThreshold`, 200 pt) : sous cette distance au bas, le bouton « dernier
    // message » reste caché ; la tolérance en rangées d'avant garde son rôle pour les rangées hautes.
    val nearBottomThresholdPx = with(LocalDensity.current) { ChatScrollGeometry.NEAR_BOTTOM_THRESHOLD_DP.dp.toPx() }
    val isNearBottom by remember(listItems) {
        derivedStateOf {
            listState.isNearBottomPx(nearBottomThresholdPx) || ChatScrollGeometry.isNearBottom(
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
    // #14670 — au bas d'une fenêtre ancrée sur un message ancien, la page suivante vers le présent.
    LaunchedEffect(isNearBottom, host.landing.hasMoreNewer, host.landing.isLoadingNewer) {
        if (isNearBottom && host.landing.hasMoreNewer && !host.landing.isLoadingNewer) actions.loadNewer()
    }
    // La pastille de jour flottante suit la loi d'iOS `MessageDayStickyLaw` : elle nomme la rangée
    // réellement en haut du fil, sous la bande d'en-tête, et se tait dès qu'un séparateur de jour
    // est à l'écran — jamais deux pastilles empilées. Masquée quand l'en-tête est déplié.
    val density = LocalDensity.current
    val hasBanners = state.pinnedBanner != null || state.liveLocationBadges.isNotEmpty()
    // Avec un bandeau, le fil démarre SOUS l'en-tête et ses bandeaux : la pastille aussi.
    val listTopInset = if (hasBanners) 0.dp else topInset
    val readingLinePx = with(density) { (MeeshySpacing.sm + listTopInset).toPx() }
    // Focal : la scène au défilement (cadre de l'élu, loupe, passage des voisines).
    val focalMode = host.readingMode?.state?.mode == ConversationReadingMode.FOCAL
    val focalScene = remember { FocalSceneState() }
    val reduceMotion = LocalReduceMotion.current
    val renderedIndexOf = remember(renderedItems) {
        HashMap<Any, Int>(renderedItems.size).apply { renderedItems.forEachIndexed { index, item -> put(item.key, index) } }
    }
    FocalSceneDriver(
        enabled = focalMode,
        scene = focalScene,
        listState = listState,
        renderedItems = renderedItems,
        chrome = host.chrome,
        reduceMotion = reduceMotion,
    )
    // La pilule jour·heure, la révélation de l'heure des rangées plates (loi des 900 ms) et le clavier d'abord.
    val timePill = rememberScrollTimePillDriver(listState, renderedItems, host.chrome, readingLinePx)
    val scrollConnection = rememberKeyboardFirstScrollConnection(listState, host.chrome.threadScroll)
    val metaAlphaState = animateFloatAsState(
        targetValue = if (timePill.reveal.isRevealed && flatRows) 1f else 0f,
        animationSpec = tween(FocalMetrics.Pill.FADE_DURATION_MS.toInt()),
        label = "flat-meta",
    )
    val metaAlpha = remember(metaAlphaState) { { metaAlphaState.value } }
    var scrollAffordance by remember { mutableStateOf(ScrollAffordanceState()) }
    val media = rememberChatMediaHost(actions.dismissImageViewer)
    LaunchedEffect(audioPlayer, media) { audioPlayer?.fullscreenRequests?.collect { id -> media.open(MediaPresentation.Audio(id)) } }
    LaunchedEffect(state.imageViewer == null) { if (state.imageViewer == null) media.onImageViewerClosed() }
    BackHandler(enabled = media.active != null && media.active !is MediaPresentation.Image) { media.close() }
    var pieceOverlay by remember { mutableStateOf<PieceOverlayModel?>(null) }
    val currentMessages by rememberUpdatedState(state.messages)
    val haptics = rememberMeeshyHaptics()
    val selectionContext = LocalContext.current
    val capReachedMessage = stringResource(R.string.chat_selection_cap_reached)
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val openMessageMenu: (String) -> Unit = { id ->
        MessageMenuKeyboard.open(id, { focusManager.clearFocus(force = true); keyboardController?.hide() }, actions.onMessageLongPress)
    }
    val rowActions = remember(actions, bubbleFrames, profileTap, haptics, capReachedMessage, host.navigation, media, state.quickReactions) {
        ChatMessageRowActions(
            onReply = { messageId -> actions.startReply(messageId) },
            onForward = { messageId -> actions.openForward(messageId) },
            onLongPress = { messageId -> openMessageMenu(messageId) },
            onReactionClick = { messageId, emoji -> actions.toggleReaction(messageId, emoji) },
            onReactionLongPress = { messageId -> actions.openReactionDetails(messageId) },
            onImageClick = { messageId, index ->
                media.open(MediaPresentation.Image(messageId, index))
                actions.openImageViewer(messageId, index)
            },
            onImageLongPress = { messageId, attachmentId ->
                val overlay = actions.pieceOverlayFor(messageId, attachmentId)
                // Message protégé : l'appui long vise le message entier, qui rend sa forme protégée.
                if (overlay != null) pieceOverlay = overlay else openMessageMenu(messageId)
            },
            onFileClick = { messageId, attachmentId ->
                val bubble = currentMessages.firstOrNull { it.messageId == messageId }
                val file = bubble?.files?.firstOrNull { it.attachmentId == attachmentId }
                val opening = if (bubble != null && file != null) ThreadPieceOpener.of(bubble, file) else ThreadPieceOpening.ExternalFile
                when (opening) {
                    // Une vidéo du fil se regarde dans le lecteur de Meeshy, avec son PiP (#13822) ; un autre fichier sort par ACTION_VIEW.
                    is ThreadPieceOpening.Video -> media.open(MediaPresentation.Video(opening.url, opening.secure))
                    ThreadPieceOpening.ExternalFile -> actions.onFileAttachmentTap(messageId, attachmentId)
                    ThreadPieceOpening.Nothing -> Unit
                }
            },
            onLocationClick = { messageId, location ->
                OpenedPlace.of(messageId, location)?.let { media.open(MediaPresentation.Place(it.messageId, it.place)) }
            },
            onReplyPreviewClick = { messageId -> actions.onReplyPreviewTap(messageId) },
            onFlagTap = { messageId, code -> actions.onFlagTap(messageId, code) },
            onAudioLanguage = { messageId, code -> actions.onAudioLanguage(messageId, code) },
            onReplyCountTap = { messageId -> actions.onReplyCountTap(messageId) },
            onReplyCountLongPress = { messageId -> actions.openReplyThread(messageId) },
            onRetry = { messageId -> actions.retryMessage(messageId) },
            onSenderTap = { bubble -> bubble.senderProfile?.let(profileTap) },
            onQuotedAuthorTap = { bubble -> bubble.replyToAuthor?.let(profileTap) },
            onQuotedMediaTap = { messageId, quotedId ->
                val quoted = currentMessages.firstOrNull { it.messageId == quotedId }
                val quotedVoice = ChatAudioFullscreenSources.quotedVoiceId(currentMessages.firstOrNull { it.messageId == messageId }, quoted)
                    ?.takeIf { id -> ChatAudioFullscreenSources.of(id, currentMessages, state.conversationId, state.conversationTitle.orEmpty()) != null }
                if (quoted?.images?.isNotEmpty() == true && !quoted.isBlurred && quoted.blurReveal == null) {
                    media.open(MediaPresentation.Image(quotedId, 0))
                    actions.openImageViewer(quotedId, 0)
                } else if (quotedVoice != null) {
                    media.open(MediaPresentation.Audio(quotedVoice))
                } else {
                    actions.onReplyPreviewTap(messageId)
                }
            },
            onOpenJoinProfile = { bubble -> bubble.joinNotice?.toProfileSheetUser()?.let(profileTap) },
            onGreetArrivals = actions.greetArrivals,
            onCallBack = { bubble ->
                val isVideo = bubble.callSummary?.callType == me.meeshy.sdk.model.CallSummaryMetadata.MediaType.VIDEO
                host.navigation.onStartCall(state.conversationTitle.orEmpty(), isVideo)
            },
            onAddReaction = { messageId ->
                val quick = state.quickReactions.firstOrNull()
                if (quick == null) actions.openEmojiPicker(messageId) else actions.toggleReaction(messageId, quick)
            },
            onOpenReactPicker = { messageId -> actions.openEmojiPicker(messageId) },
            onTranslationDetail = { messageId -> actions.openLanguageExplorer(messageId) },
            onBubbleFramed = { messageId, frame -> bubbleFrames[messageId] = frame },
            onStoryCitationOpen = { postId -> host.navigation.onOpenCitedPost(postId) },
            onOpenConversation = { conversationId -> host.navigation.onOpenConversation(conversationId) },
            onToggleSelection = { messageId ->
                when (actions.toggleSelection(messageId)) {
                    is MessageSelection.Toggle.Changed -> haptics.light()
                    MessageSelection.Toggle.CapReached -> {
                        haptics.error()
                        Toast.makeText(selectionContext, capReachedMessage, Toast.LENGTH_SHORT).show()
                    }
                    MessageSelection.Toggle.Ignored -> Unit
                }
            },
        )
    }
    // #14670 — le bas d'une fenêtre ancrée n'est pas le présent : ↓ reste tant que le fil n'y est pas.
    val isAtPresent = host.landing.isAtPresent(isNearBottom)
    LaunchedEffect(affordanceMessages, isAtPresent) {
        scrollAffordance = ScrollAffordance.next(scrollAffordance, affordanceMessages, isAtPresent)
    }
    // Un défilement programmatique (saut vers une citation, retour au bas) ne passe par aucun geste :
    // à son arrêt, le compteur et l'aperçu se resynchronisent sur la position RÉELLE (iOS `noteNearBottomTransition`).
    val latestAffordanceMessages by rememberUpdatedState(affordanceMessages)
    val latestAtPresent by rememberUpdatedState(isAtPresent)
    LaunchedEffect(listState) {
        snapshotFlow { listState.isScrollInProgress }
            .distinctUntilChanged()
            .filter { settled -> !settled }
            .collect { scrollAffordance = ScrollAffordance.next(scrollAffordance, latestAffordanceMessages, latestAtPresent) }
    }

    // #13995 — la preuve d'affichage de la flamme-œil : les bulles que le fil MONTRE.
    val shownItems by rememberUpdatedState(renderedItems)
    LaunchedEffect(listState) {
        snapshotFlow {
            val items = shownItems
            listState.layoutInfo.visibleItemsInfo.mapNotNull { info ->
                (items.getOrNull(info.index) as? ChatListItem.Message)?.bubble?.messageId
            }
        }
            .distinctUntilChanged()
            .collect { ids -> actions.noteDisplayed(ids) }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { actions.consumeAfterReadOnExit() }
    val viewOnceConsumer = remember(actions) { ViewOnceConsumer { id -> actions.consumeViewOnce(id) } }

    // ROULEAU : l'ancien est demandé à 4 hauteurs d'écran du bord chargé — on ne le frappe jamais.
    // Le nombre de rangées est dans la clé : une page arrivée trop courte relance la demande.
    LaunchedEffect(listState) {
        snapshotFlow {
            val lastIndex = shownItems.lastIndex
            val viewportPx = (listState.layoutInfo.viewportEndOffset - listState.layoutInfo.viewportStartOffset).toFloat()
            ChatScrollGeometry.shouldLoadOlder(listState.distanceToOldEdgePx(lastIndex), viewportPx) to lastIndex
        }
            .distinctUntilChanged()
            .collect { (nearOldEdge, _) -> if (nearOldEdge) actions.loadOlder() }
    }

    val storageAccess = rememberPermissionFlow()
    PermissionFlowHost(storageAccess)
    pieceOverlay?.let { overlay ->
        MessagePieceOverlay(
            model = overlay,
            accent = remember(state.accentColorHex) { hexColor(state.accentColorHex ?: DEFAULT_PLACE_ACCENT, hexColor(DEFAULT_PLACE_ACCENT)) },
            onReply = { actions.startReply(overlay.messageId) },
            onWholeMessage = { openMessageMenu(overlay.messageId) },
            onSave = { attachmentId ->
                // Dès l'API 29 la porte ne demande rien ; en 26–28 elle obtient WRITE_EXTERNAL_STORAGE avant d'écrire.
                scope.launch {
                    if (storageAccess.ensure(PermissionNature.PHOTO_LIBRARY_ADD, announcesRefusal = true)) {
                        actions.onPieceSave(overlay.messageId, attachmentId)
                    }
                }
            },
            onForward = { attachmentId -> actions.openForwardPiece(overlay.messageId, attachmentId) },
            onDelete = { attachmentId -> actions.onPieceDelete(overlay.messageId, attachmentId) },
            // #13790 — la bande d'une pièce ne fait réagir que vers une conversation connue claire.
            quickReactions = if (PlainSignalAdmission.offers(LocalChatSignalClearance.current)) state.quickReactions else emptyList(),
            onReact = { attachmentId, emoji -> actions.onPieceReact(overlay.messageId, attachmentId, emoji) },
            onDismiss = { pieceOverlay = null },
        )
    }
    val pieceRemoveFailed = stringResource(R.string.piece_remove_failed)
    LaunchedEffect(actions.pieceFailures) {
        actions.pieceFailures.collect { failure ->
            when (failure) {
                PieceFailure.REMOVE -> Toast.makeText(selectionContext, pieceRemoveFailed, Toast.LENGTH_SHORT).show()
            }
        }
    }
    when (val presented = media.active) {
        is MediaPresentation.Video ->
            MeeshyVideoViewer(mediaUrl = presented.url, onDismiss = media::close, secure = presented.secure)
        is MediaPresentation.Place -> LocationFullscreen(
            place = presented.place,
            accentColor = state.accentColorHex ?: DEFAULT_PLACE_ACCENT,
            senderName = state.messages.firstOrNull { it.messageId == presented.messageId }?.senderName,
            onDismiss = media::close,
        )
        is MediaPresentation.Audio -> ChatAudioFullscreen(
            attachmentId = presented.attachmentId,
            thread = state.messages,
            conversationId = state.conversationId,
            conversationName = state.conversationTitle.orEmpty(),
            voice = audioPlayer,
            accent = accentColor,
            onDismiss = media::close,
            onDismissToMessage = actions.scrollToMessage,
            conversationIsEndToEnd = state.isEndToEnd,
            onDownload = { source ->
                scope.launch {
                    if (storageAccess.ensure(PermissionNature.PHOTO_LIBRARY_ADD, announcesRefusal = true)) {
                        actions.onPieceSave(source.carrierId, source.id)
                    }
                }
            },
            download = state.fileDownload,
            onDismissDownload = actions.dismissFileDownload,
            onRetryDownload = actions.retryFileDownload,
            languages = remember(actions.onAudioLanguage, actions.attachmentsOf, state.encryptionMode) {
                ChatAudioFullscreenLanguages(actions.onAudioLanguage, actions.attachmentsOf, state.encryptionMode)
            },
            actions = me.meeshy.app.chat.audio.rememberChatAudioFullscreenActions(
                replies = actions.audioFullscreenReplies,
                actions = actions,
                state = state,
                clearance = LocalChatSignalClearance.current,
                closure = host.composerClosure,
                openCard = host.sheets.openExportCard,
            ),
        )
        else -> Unit
    }
    val fileTransfers = remember(state.fileDownload, host.downloadedFileIds) { bubbleFileTransfersOf(state.fileDownload, host.downloadedFileIds) }
    CompositionLocalProvider(LocalBubbleFileTransfers provides fileTransfers, LocalViewOnceConsumer provides viewOnceConsumer) {
    Box(modifier = modifier.fillMaxSize()) {
        when {
            state.loadingPhase(host.landing.isLoadingNewer).isBlockingSpinnerNeeded -> Box(Modifier.padding(top = topInset, bottom = bottomInset)) { ChatSkeleton() }

            state.messages.isEmpty() -> Box(Modifier.padding(top = topInset, bottom = bottomInset)) {
                val notice = state.emptyThreadNotice()
                ChatNotice(stringResource(notice.text), onRetry = actions.refresh.takeIf { notice.offersRetry })
            }

            else -> Box(Modifier.fillMaxSize()) {
            val typingReserve = if (state.typingParticipants.isEmpty()) 0.dp else TYPING_RESERVE
            Column(modifier = Modifier.fillMaxSize()) {
                // Les bandeaux (épinglé, positions en direct) se posent sous l'en-tête
                // flottant ; sans bandeau, le fil remonte sous l'en-tête comme sur iOS.
                if (hasBanners) Spacer(Modifier.height(topInset))
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
                    scrollTimePill = timePill.pill,
                    scrollConnection = scrollConnection,
                    scrollAffordance = scrollAffordance,
                    typingParticipants = state.typingParticipants,
                    isOffline = state.isOffline,
                    onScrollToBottom = {
                        actions.returnToPresent()
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
                    topInset = listTopInset,
                    bottomInset = bottomInset + typingReserve,
                ) { item ->
                    val row: @Composable (Boolean, Float) -> Unit = { elected, scale -> ChatListRow(
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
                        canWrite = state.viewerMayWrite,
                        flat = flatRows,
                        metaAlpha = metaAlpha,
                        focalElected = elected,
                        focalScale = scale,
                        selecting = host.selection.isActive,
                        selectedIds = host.selection.ids,
                        translatingLanguages = state.translatingLanguages,
                        overlayMessageId = state.actionMessageId,
                    ) }
                    val framed: @Composable (Boolean, Float) -> Unit = { elected, scale ->
                        if (item is ChatListItem.Message) {
                            LongMessageExpansionRow(item.bubble.messageId, expansionHost) { row(elected, scale) }
                        } else {
                            row(elected, scale)
                        }
                    }
                    val landed = item is ChatListItem.Message && item.bubble.messageId == host.landing.highlightedMessageId
                    if (focalMode) {
                        FocalPassageItem(item.key, focalScene, renderedIndexOf) { elected -> framed(elected, focalScene.contentScale) }
                    } else if (landed) {
                        LandingHighlight(accentColor) { framed(false, 1f) }
                    } else {
                        framed(false, 1f)
                    }
                }
            }
            // La frappe se pose juste au-dessus de la barre flottante, dans la réserve du fil.
            Box(Modifier.align(Alignment.BottomStart).padding(bottom = bottomInset)) {
                TypingIndicator(participants = state.typingParticipants)
            }
            }
        }
        // Le Résumé vivant : une surcouche qui FOND (0,18 s) sur le fil, qui reste composé dessous —
        // revenir au Script retrouve la position de défilement, aucune liste n'est reconstruite.
        val summaryMode = host.readingMode?.state?.mode == ConversationReadingMode.SUMMARY
        val modeFadeMs = if (reduceMotion) 0 else MODE_FADE_MS
        AnimatedVisibility(
            visible = summaryMode,
            enter = fadeIn(tween(modeFadeMs)),
            exit = fadeOut(tween(modeFadeMs)),
        ) {
            LivingSummaryOverlay(host = host, topInset = topInset, bottomInset = bottomInset)
        }
        // La Rivière : même patron — une surcouche qui fond sur le fil, resté composé dessous. Son état
        // est hissé ici : y revenir retrouve le curseur et les deux défilements. Le garde de mode
        // (`RiverModeGate`) la tient fermée quand la conversation ou l'interrupteur ne l'offrent pas.
        val riverPane = remember { RiverPaneState() }
        val riverMode = host.readingMode?.state?.let {
            it.mode == ConversationReadingMode.RIVER && RiverModeGate.isSelectable(it.capabilities)
        } == true
        // Sous un panneau opaque, la liste s'endort : les flux continuent, l'état est rejoué au réveil.
        val threadVisible = ChatListQuiescence.rendersThread(host.readingMode?.state?.mode, riverOpen = riverMode)
        DisposableEffect(threadVisible) {
            host.chrome.listGate?.setAsleep(!threadVisible)
            onDispose { host.chrome.listGate?.setAsleep(false) }
        }
        AnimatedVisibility(
            visible = riverMode,
            enter = fadeIn(tween(modeFadeMs)),
            exit = fadeOut(tween(modeFadeMs)),
        ) {
            RiverScreen(host = host, pane = riverPane, topInset = topInset, bottomInset = bottomInset, rowActions = rowActions, audioPlayer = audioPlayer)
        }
    }
    }
}

private const val DEFAULT_PLACE_ACCENT = "6366F1"

/** Le fondu entre le fil et le Résumé : celui des bulles qui arrivent (iOS `.transition(.opacity)`). */
private const val MODE_FADE_MS = 180

/** La place réservée au bas du fil pour l'indicateur de frappe qui flotte au-dessus de la barre. */
private val TYPING_RESERVE = 28.dp

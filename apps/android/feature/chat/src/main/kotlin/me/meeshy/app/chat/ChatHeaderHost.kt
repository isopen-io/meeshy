package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.ConversationEngagementSnapshot
import me.meeshy.sdk.model.engagement.HeaderFlameLaw
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.relation.TalkieOfferRule
import me.meeshy.ui.component.talkie.TalkieHeaderLive
import me.meeshy.ui.component.talkie.TalkieHeaderLiveBar
import me.meeshy.ui.component.reading.ReadingModeChip
import me.meeshy.ui.component.rememberConversationHere
import me.meeshy.ui.component.rememberPresence
import androidx.compose.foundation.background
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.profile.LocalPeerMoodDirectory
import me.meeshy.ui.profile.LocalPeerMoodOpener
import me.meeshy.ui.profile.LocalProfileSheetOpener

/**
 * Header layer, port de l'en-tête iOS (`ConversationView+Header`) : la bande repliée — retour
 * avec les non-lus des autres conversations, appel (menu vocal / vidéo), recherche et avatar
 * tout à droite —, puis la barre de recherche qui glisse SOUS la bande quand elle est ouverte.
 * Reads [ChatHostContext] only; the ViewModel is reached through its plain callbacks.
 */
@Composable
internal fun ChatHeaderHost(host: ChatHostContext, serverSearch: ChatServerSearch? = null) {
    val state = host.state
    val actions = host.actions
    val navigation = host.navigation
    val sheets = host.sheets
    val header = host.header
    val accentColor = host.accentColor
    val profileOpener = LocalProfileSheetOpener.current
    val title = state.conversationTitle ?: stringResource(R.string.chat_title)
    // A share-link guest carries composer permissions: iOS hides the call entry for
    // `viewerIsGuest`, and the avatar keeps the header toggle instead of opening a sheet.
    val isGuest = state.composerPermissions != null
    val door = ChatHeaderAvatarDoor.resolve(
        isDirect = !state.isGroup,
        isGuest = isGuest,
        peerUserId = state.directPeerUserId,
        hasConversation = state.conversationTitle != null,
    )
    val openProfile: () -> Unit = {
        val peerId = state.directPeerUserId
        if (peerId != null) {
            profileOpener.open(
                ProfileSheetUser(
                    userId = peerId,
                    username = header.peerUsername ?: title,
                    displayName = header.peerDisplayName ?: title,
                    avatarUrl = header.avatarUrl,
                ),
            )
        }
    }
    val openDetails: () -> Unit = { sheets.info = true }

    // Replié par défaut, mémorisé par conversation (iOS `ConversationHeaderMemory`).
    val appContext = LocalContext.current.applicationContext
    val memory = remember(appContext) { ChatHeaderMemory(appContext) }
    var expanded by remember(state.conversationId) { mutableStateOf(memory.isExpanded(state.conversationId)) }
    SideEffect { host.chrome.isHeaderExpanded = expanded }
    // La Flamme masquée d'un toucher revient au prochain dépliement (iOS `HeaderFlameVisibility`).
    var flameDismissed by remember(state.conversationId) { mutableStateOf(memory.isFlameDismissed(state.conversationId)) }
    val toggle: () -> Unit = {
        expanded = !expanded
        memory.setExpanded(expanded, state.conversationId)
        val dismissedNow = HeaderFlameLaw.dismissedAfterHeaderExpanded(expanded, flameDismissed)
        if (dismissedNow != flameDismissed) {
            flameDismissed = dismissedNow
            memory.setFlameDismissed(dismissedNow, state.conversationId)
        }
    }
    val peerPresence = rememberPresence(state.directPeerUserId)
    val peerHere = rememberConversationHere(state.directPeerUserId.takeUnless { state.isGroup }, state.conversationId)
    // La boule de mood du pair ouvre sa page plein écran, sans bulle ni pop-up (#13987, iOS).
    val peerMood = if (state.isGroup) null else LocalPeerMoodDirectory.current.moodOf(state.directPeerUserId)
    val moodOpener = LocalPeerMoodOpener.current
    val headerAvatar: @Composable (AvatarContext) -> Unit = { context ->
        ChatHeaderAvatar(
            name = title,
            door = door,
            accentColor = accentColor,
            imageUrl = header.avatarUrl,
            presence = if (state.isGroup) null else peerPresence,
            here = peerHere,
            isUser = !state.isGroup,
            onOpenProfile = openProfile,
            onOpenDetails = openDetails,
            onToggle = toggle,
            context = context,
            mood = peerMood,
            onOpenMood = moodOpener::open,
        )
    }

    // Le talkie d'un direct (#17315) : dès Proche, jamais chiffré, jamais pour un invité.
    val talkiePeer = state.directPeerUserId?.takeIf {
        !state.isGroup && !isGuest && TalkieOfferRule.mayShowInHeader(state.encryptionMode)
    }
    val talkie = talkiePeer?.let { peer ->
        rememberChatHeaderTalkie(peerUserId = peer, peerName = header.peerDisplayName ?: title, accent = accentColor)
    }
    val talkieLive = talkie?.live ?: TalkieHeaderLive.Rest

    Column(Modifier.statusBarsPadding()) {
        if (isGuest) {
            ChatGuestHeaderBar(
                title = title,
                avatarUrl = header.avatarUrl,
                shareUrl = header.publicShareUrl,
                accentColor = accentColor,
                onClose = navigation.onBack,
            )
        } else AnimatedContent(
            targetState = expanded,
            transitionSpec = {
                fadeIn(spring(dampingRatio = HEADER_SPRING_DAMPING, stiffness = HEADER_SPRING_STIFFNESS)) togetherWith
                    fadeOut(spring(dampingRatio = HEADER_SPRING_DAMPING, stiffness = HEADER_SPRING_STIFFNESS))
            },
            label = "headerBand",
        ) { isExpanded ->
            if (isExpanded) {
                ChatConversationExpandedBand(
                    title = title,
                    accentColor = accentColor,
                    otherUnread = header.otherConversationsUnread,
                    encryption = ChatHeaderEncryptionBadge.of(state.encryptionMode),
                    onBack = navigation.onBack,
                    onToggle = toggle,
                    onTitleTap = { if (!isGuest) openDetails() else toggle() },
                    subtitle = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
                        ) {
                            TypingAvatarCluster(
                                stack = TypingAvatarStack.of(state.typingParticipants),
                                accentColor = accentColor,
                            )
                            ChatHeaderEngagementPill(
                                snapshot = host.engagement.snapshot?.forDay(
                                    ConversationEngagementSnapshot.dayString(java.time.LocalDate.now()),
                                ),
                                onOpenProgression = navigation.onOpenProgression,
                                onHideFlame = {
                                    flameDismissed = true
                                    memory.setFlameDismissed(true, state.conversationId)
                                },
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
                    },
                    avatar = { headerAvatar(AvatarContext.ConversationHeaderExpanded) },
                )
            } else Box {
                ChatConversationHeaderBand(
                    accentColor = accentColor,
                    actionsHidden = host.chrome.isScrolling,
                    otherUnread = header.otherConversationsUnread,
                    onBack = navigation.onBack,
                    onSearch = actions.openSearch,
                    onToggle = toggle,
                    talkieChrome = talkieLive.chrome,
                    callSlot = {
                        // Le Bring (#17442) : tout direct ouvert, dès Ami — la passerelle décide, même chiffré.
                        state.directPeerUserId?.takeIf { !state.isGroup }?.let { peer ->
                            ChatHeaderBringButton(peerUserId = peer, peerName = header.peerDisplayName ?: title)
                        }
                        talkie?.button?.invoke()
                        ChatHeaderCallSlot(
                            conversationId = state.conversationId,
                            entry = navigation.callEntry.takeIf { !isGuest },
                            serverActiveCall = state.activeCall,
                            localCall = navigation.localCall,
                            hasLocalLiveCall = navigation.hasLocalLiveCall,
                            isGroup = state.isGroup,
                            calleeName = state.conversationTitle.orEmpty(),
                            accentColor = accentColor,
                            onStartCall = { isVideo -> navigation.onStartCall(state.conversationTitle.orEmpty(), isVideo) },
                            onRejoinCall = { call -> navigation.onRejoinCall(call, state.conversationTitle.orEmpty()) },
                        )
                        header.publicShareUrl?.let { ChatHeaderShareButton(url = it, accentColor = accentColor) }
                    },
                    avatar = {
                        HeaderFlameDecoration(
                            snapshot = host.engagement.snapshot,
                            sent = host.engagement.sent,
                            headerExpanded = expanded,
                            dismissed = flameDismissed,
                            onDismiss = {
                                flameDismissed = true
                                memory.setFlameDismissed(true, state.conversationId)
                            },
                            onOpenProgression = navigation.onOpenProgression,
                        ) { headerAvatar(AvatarContext.ConversationHeaderCollapsed) }
                    },
                    readingModeSlot = {
                        val readingMode = host.readingMode
                        if (readingMode != null && readingMode.state.showsChip) {
                            ReadingModeChip(
                                mode = readingMode.state.mode,
                                isAuto = readingMode.state.isAuto,
                                entries = readingMode.state.menuEntries,
                                nextInCycle = readingMode.state.nextInCycle,
                                accentColor = accentColor,
                                onSelect = readingMode.select,
                                onAuto = readingMode.resetToAuto,
                            )
                        }
                    },
                )
                if (talkieLive.chrome.talkieSpansBar) {
                    TalkieHeaderLiveBar(
                        live = talkieLive,
                        modifier = Modifier
                            .matchParentSize()
                            .padding(top = MeeshySpacing.sm, start = MeeshySpacing.lg, end = MeeshySpacing.lg + MeeshySpacing.sm),
                    )
                }
            }
        }
        AnimatedVisibility(
            visible = state.search.isActive,
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
        ) {
            ChatSearchBar(
                search = state.search,
                accentColor = accentColor,
                onQueryChange = actions.onSearchQueryChange,
                onPrevious = actions.previousSearchMatch,
                onNext = actions.nextSearchMatch,
                onClose = actions.closeSearch,
            )
        }
        val serverResults by (serverSearch?.state ?: NO_SERVER_SEARCH).collectAsStateWithLifecycle()
        if (state.search.isActive && serverResults.panelOpen) {
            ChatSearchResultsSheet(
                state = serverResults,
                accentColor = accentColor,
                onSelect = actions.selectSearchResult,
                onLoadMore = { serverSearch?.loadMore() },
                onRetry = { serverSearch?.retry() },
                modifier = Modifier.background(MeeshyTheme.tokens.backgroundSecondary),
            )
        }
    }
}

private val NO_SERVER_SEARCH: kotlinx.coroutines.flow.StateFlow<ChatServerSearchState> =
    kotlinx.coroutines.flow.MutableStateFlow(ChatServerSearchState())

/** Le ressort de bascule de l'en-tête (iOS `spring(response: 0.35, dampingFraction: 0.8)`) : raideur = (2π / 0,35)². */
private const val HEADER_SPRING_DAMPING = 0.8f
private const val HEADER_SPRING_STIFFNESS = 322f

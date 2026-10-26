package me.meeshy.app.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
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
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.profile.LocalProfileSheetOpener

/**
 * Header layer, port de l'en-tête iOS (`ConversationView+Header`) : la bande repliée — retour
 * avec les non-lus des autres conversations, appel (menu vocal / vidéo), recherche et avatar
 * tout à droite —, puis la barre de recherche qui glisse SOUS la bande quand elle est ouverte.
 * Reads [ChatHostContext] only; the ViewModel is reached through its plain callbacks.
 */
@Composable
internal fun ChatHeaderHost(host: ChatHostContext) {
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
    val toggle: () -> Unit = {
        expanded = !expanded
        memory.setExpanded(expanded, state.conversationId)
    }
    val headerAvatar: @Composable (AvatarContext) -> Unit = { context ->
        ChatHeaderAvatar(
            name = title,
            door = door,
            accentColor = accentColor,
            imageUrl = header.avatarUrl,
            presence = if (state.isGroup) null else state.headerPresence(System.currentTimeMillis()),
            isUser = !state.isGroup,
            onOpenProfile = openProfile,
            onOpenDetails = openDetails,
            onToggle = toggle,
            context = context,
        )
    }

    Column(Modifier.statusBarsPadding()) {
        AnimatedContent(
            targetState = expanded,
            transitionSpec = {
                fadeIn(spring(dampingRatio = 0.8f, stiffness = 300f)) togetherWith
                    fadeOut(spring(dampingRatio = 0.8f, stiffness = 300f))
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
            } else {
                ChatConversationHeaderBand(
                    accentColor = accentColor,
                    actionsHidden = host.chrome.isScrolling,
                    otherUnread = header.otherConversationsUnread,
                    onBack = navigation.onBack,
                    onSearch = actions.openSearch,
                    onToggle = toggle,
                    callSlot = {
                        val peerName = state.conversationTitle.orEmpty()
                        val callEntry = navigation.callEntry.takeIf { !isGuest }
                        val ongoing = state.activeCall
                            ?.takeIf { callEntry != null && RejoinPillPolicy.shouldOffer(it, navigation.hasLocalLiveCall) }
                        if (ongoing != null) {
                            // A call the local session lost is still live server-side: offer
                            // « Rejoindre » (joins the existing call) instead of placing a NEW call.
                            RejoinCallPill(
                                isVideo = ongoing.isVideo,
                                onClick = { navigation.onRejoinCall(ongoing, peerName) },
                            )
                        } else if (callEntry?.canStart == true) {
                            ChatHeaderCallButton(
                                isGroup = state.isGroup,
                                accentColor = accentColor,
                                onCall = { isVideo -> navigation.onStartCall(peerName, isVideo) },
                            )
                        }
                    },
                    avatar = { headerAvatar(AvatarContext.ConversationHeaderCollapsed) },
                )
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
    }
}

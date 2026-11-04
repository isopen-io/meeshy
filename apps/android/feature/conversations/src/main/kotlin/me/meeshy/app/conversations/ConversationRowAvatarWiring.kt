package me.meeshy.app.conversations

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import me.meeshy.sdk.model.conversationlist.AvatarMenuRole
import me.meeshy.sdk.model.conversationlist.ConversationAvatarMenu
import me.meeshy.sdk.model.conversationlist.ConversationAvatarRoute
import me.meeshy.sdk.model.conversationlist.ConversationAvatarSpeech
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.model.conversationlist.avatarTarget

/**
 * Les gestes de l'avatar d'une ligne (#15989), lus de la loi au RENDU : ce qu'il annonce (profil ou
 * détails) et les entrées de son menu. Le toucher, lui, relit la loi au ViewModel — un verrou ou un
 * blocage posés depuis ce rendu comptent. `null` quand l'hôte ne sait pas montrer les détails.
 */
@Composable
internal fun rememberRowAvatarGestures(
    model: ConversationRowModel,
    actions: ConversationRowActions,
    capabilities: ConversationRowMenuCapabilities,
): ConversationRowAvatarGestures? {
    val onTap = actions.onAvatarTap ?: return null
    val conversation = model.conversation
    val route = remember(conversation, model.currentUserId, model.isLocked) {
        ConversationAvatarRoute.route(
            target = conversation.avatarTarget(model.currentUserId, isPeerBlocked = actions.peerBlocked() == true),
            isLocked = model.isLocked,
        )
    }
    val hasShare = capabilities.invite && actions.onCreateShareLink != null
    val roles = ConversationAvatarMenu.roles(conversation.type, route.opensProfile, hasShare)
        .filter { it != AvatarMenuRole.PROFILE || actions.onViewProfile != null }
    return ConversationRowAvatarGestures(
        labelKind = ConversationAvatarSpeech.labelKind(route),
        roles = roles,
        onTap = onTap,
        onRole = { role ->
            when (role) {
                AvatarMenuRole.CONVERSATION_INFO -> actions.onAvatarInfo()
                AvatarMenuRole.PROFILE -> actions.onViewProfile?.invoke()
                AvatarMenuRole.SHARE_LINK -> actions.onCreateShareLink?.invoke()
            }
        },
        onViewStory = actions.onViewStory,
        onMoodTap = actions.onMoodBadgeTap,
    )
}

/** Chaque apparition d'une humeur sur l'avatar d'une ligne compte une impression (iOS `moodAvatar`). */
@Composable
internal fun MoodImpressionOnAppearance(conversationId: String, moodEmoji: String?, onShown: () -> Unit) {
    val shown = rememberUpdatedState(onShown)
    LaunchedEffect(conversationId, moodEmoji) {
        if (moodEmoji != null) shown.value()
    }
}

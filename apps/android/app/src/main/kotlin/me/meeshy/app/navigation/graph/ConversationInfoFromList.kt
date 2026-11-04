package me.meeshy.app.navigation.graph

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import me.meeshy.app.chat.ConversationInfoPresenter
import me.meeshy.app.chat.ConversationInfoSeed
import me.meeshy.app.navigation.Routes
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.interlocutor
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.sdk.model.displayedAvatar
import me.meeshy.ui.theme.displayPaletteInTheme
import me.meeshy.ui.theme.hexColor

/**
 * La fiche Conversation d'une ligne, ouverte par son avatar (#15989) sur la liste, sans entrer dans le fil.
 * Le nom, la photo et l'accent sont ceux que la ligne montre ; « Aller au message » et le partage rejoignent
 * leur destination.
 */
@Composable
internal fun ConversationInfoFromList(
    conversation: ApiConversation,
    readerId: String?,
    navController: NavHostController,
    onDismiss: () -> Unit,
) {
    val palette = conversation.displayPaletteInTheme()
    ConversationInfoPresenter(
        seed = ConversationInfoSeed(
            conversationId = conversation.id,
            title = conversation.displayTitle(readerId),
            avatarUrl = conversation.displayedAvatar(readerId),
            accentColor = hexColor(palette.primary),
            accentHex = conversation.accentHex(),
            peerUserId = conversation.interlocutor(readerId)?.userId,
            memberCount = conversation.memberCount,
            encryptionMode = conversation.encryptionMode,
        ),
        onDismiss = onDismiss,
        onOpenMessage = { messageId ->
            navController.navigate(Routes.chat(conversation.id, highlightMessageId = messageId))
        },
        onShare = { navController.navigate(Routes.createShareLink(conversation.id)) },
    )
}

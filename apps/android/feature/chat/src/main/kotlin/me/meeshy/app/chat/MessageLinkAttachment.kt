package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import me.meeshy.app.chat.conversationcard.ConversationLinkCard
import me.meeshy.app.chat.conversationcard.ConversationLinkCards
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import androidx.compose.ui.graphics.Color

/**
 * Ce qu'une URL du message devient sous le texte, en bulle comme en rangée plate (iOS
 * `BubbleLinkEmbed`) : la CARTE de conversation quand l'URL désigne une conversation Meeshy ([cardTarget]
 * non nul et [cards] fournies), sinon l'aperçu de lien générique [preview] — comportement inchangé.
 * Quand le serveur ne sert pas la carte, c'est encore [preview] qui prend la place.
 */
@Composable
internal fun MessageLinkAttachment(
    cardTarget: ConversationCardTarget?,
    cards: ConversationLinkCards?,
    fallbackAccent: Color,
    onOpenConversation: (conversationId: String) -> Unit,
    preview: @Composable () -> Unit,
) {
    if (cards != null && cardTarget != null) {
        ConversationLinkCard(
            target = cardTarget,
            cards = cards,
            fallbackAccent = fallbackAccent,
            onOpenConversation = onOpenConversation,
            fallback = preview,
        )
    } else {
        preview()
    }
}

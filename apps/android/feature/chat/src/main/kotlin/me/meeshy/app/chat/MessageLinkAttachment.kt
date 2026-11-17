package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import me.meeshy.app.chat.conversationcard.ConversationLinkCard
import me.meeshy.app.chat.conversationcard.ConversationLinkCards
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.model.link.MessageLinkExposure
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.contentcard.ContentLinkCard
import me.meeshy.ui.component.contentcard.ContentLinkCards
import androidx.compose.ui.graphics.Color

/**
 * Ce qu'une URL du message devient sous le texte, en bulle comme en rangée plate (iOS
 * `BubbleLinkEmbed`) : la CARTE de conversation quand l'URL désigne une conversation Meeshy ([cardTarget]
 * non nul et [cards] fournies), la CARTE du contenu quand elle désigne un post, un réel, une story ou une
 * humeur ([contentTarget] et [contentCards], #19331), sinon l'aperçu de lien générique [preview] —
 * comportement inchangé. Quand le serveur ne sert pas la carte, c'est encore [preview] qui prend la place.
 */
@Composable
internal fun MessageLinkAttachment(
    cardTarget: ConversationCardTarget?,
    cards: ConversationLinkCards?,
    fallbackAccent: Color,
    onOpenConversation: (conversationId: String) -> Unit,
    contentTarget: ContentLinkTarget? = null,
    contentCards: ContentLinkCards? = null,
    onLongPress: (() -> Unit)? = null,
    preview: @Composable () -> Unit,
) {
    when {
        cards != null && cardTarget != null -> ConversationLinkCard(
            target = cardTarget,
            cards = cards,
            fallbackAccent = fallbackAccent,
            onOpenConversation = onOpenConversation,
            fallback = preview,
        )
        contentCards != null && contentTarget != null -> ContentLinkCard(
            target = contentTarget,
            cards = contentCards,
            onLongPress = onLongPress,
            fallback = preview,
        )
        else -> preview()
    }
}

/**
 * Ce que les liens de cette bulle ont le droit de faire sortir de l'appareil (iOS `LinkExposure.of`) : rien d'un auteur
 * sans compte, rien d'un texte que seul cet appareil lit (scellé, ouvert ici, ou de bout en bout).
 */
internal fun BubbleContent.linkExposure(): MessageLinkExposure = MessageLinkExposure.of(
    senderHasAccount = senderHasAccount && !senderIsAnonymous,
    readOnlyOnDevice = isEndToEndSealed || isEndToEndOpened || holdsEndToEndSend,
)

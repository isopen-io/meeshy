package me.meeshy.app.chat.export

import me.meeshy.sdk.model.card.PostCommentCardPart
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * CE QUE L'ATELIER IMAGE — un message, relu VIVANT (sa bulle), ou une carte que l'hôte a déjà composée (un commentaire,
 * #13922). L'atelier n'en connaît que la carte de chaque langue offerte et le droit de continuer à la peindre.
 */
internal interface CardSource {
    /** L'identité de ce qu'on image : l'atelier se rouvre neuf quand elle change. */
    val key: String
    val languages: List<CardLanguage>
    fun subject(language: String?): CardSubject?

    /** Le contenu a-t-il encore le droit de partir ? Faux : l'atelier se ferme au lieu de peindre l'instantané. */
    fun stillAllowed(nowMillis: Long): Boolean
}

/** Un message de la conversation : sa garde se relit à chaque peinture (supprimé, rendu éphémère, protégé). */
internal class BubbleCardSource(
    private val bubble: BubbleContent,
    private val viewer: CardViewer,
    private val openedAt: Long,
) : CardSource {
    override val key: String get() = bubble.messageId
    override val languages: List<CardLanguage> = CardSubjects.languages(bubble)
    override fun subject(language: String?): CardSubject? = CardSubjects.of(bubble, viewer, openedAt, language)
    override fun stillAllowed(nowMillis: Long): Boolean = CardSubjects.refusal(bubble, nowMillis) == null
}

/** Une carte déjà composée (le texte servi par le Prisme, le support en tête) : une seule langue, la servie. */
internal class ComposedCardSource(override val key: String, private val card: CardSubject) : CardSource {
    override val languages: List<CardLanguage> = emptyList()
    override fun subject(language: String?): CardSubject = card
    override fun stillAllowed(nowMillis: Long): Boolean = true
}

/** La carte d'un commentaire, composée par `PostCommentCardComposition`, telle que le moteur de carte la peint. */
internal fun CardSubjects.of(card: PostCommentCardSubject): CardSubject = CardSubject(
    quoted = card.quoted?.let(::partOf),
    reply = partOf(card.reply),
    sentAtMillis = card.sentAtMillis,
    quotedAtMillis = card.quotedAtMillis,
)

private fun partOf(part: PostCommentCardPart): CardPart = CardPart(author = part.author, text = part.text, handle = part.handle)

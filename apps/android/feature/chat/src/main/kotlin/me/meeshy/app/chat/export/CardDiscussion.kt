package me.meeshy.app.chat.export

import me.meeshy.app.chat.ForwardUiState
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.share.ShareAction
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * **« IMAGER LA DISCUSSION »** (#14331, iOS `MessageCardDiscussion`) — depuis « Transférer », la discussion qui MÈNE au
 * message choisi devient une carte de l'atelier : une ligne par message, « Auteur : texte », titrée du nom de la
 * conversation, ses médias peignables posés dessous.
 *
 * LE PÉRIMÈTRE : les [MAX_MESSAGES] derniers messages exportables jusqu'au message choisi COMPRIS, et au plus [MAX_MEDIA]
 * médias, les plus récents. LES MÊMES GARDES qu'« Imager » un message ([CardSubjects.refusal]) : un message protégé n'entre
 * pas dans la fenêtre. Une réponse qui cite un contenu protégé dans la portée de la fenêtre la ferme entière — la sauter
 * peindrait une discussion trouée à l'endroit de ce qu'elle citait.
 */
object CardDiscussion {
    const val MAX_MESSAGES = 12
    const val MAX_MEDIA = 4

    /** Les messages imagés, dans l'ordre du fil ([messages] du plus ancien au plus récent) — vide quand rien ne s'image. */
    fun window(messages: List<BubbleContent>, endingAt: String, nowMillis: Long): List<BubbleContent> {
        val end = messages.indexOfFirst { it.messageId == endingAt }.takeIf { it >= 0 } ?: return emptyList()
        val upTo = messages.subList(0, end + 1)
        val exportable = upTo.filter { CardSubjects.refusal(it, nowMillis) == null }.takeLast(MAX_MESSAGES)
        val first = exportable.firstOrNull() ?: return emptyList()
        val start = upTo.indexOfFirst { it.messageId == first.messageId }
        if (upTo.subList(start, upTo.size).any { it.exitOffer.quotesProtectedContent }) return emptyList()
        return exportable
    }

    /** « Imager la discussion » ne s'offre que si la fenêtre a quelque chose à peindre : un bouton qui n'ouvrirait rien n'est pas rendu. */
    fun offers(messages: List<BubbleContent>, endingAt: String, nowMillis: Long): Boolean =
        window(messages, endingAt, nowMillis).isNotEmpty()

    /**
     * Le message où « Imager la discussion » s'arrête, depuis la feuille « Transférer » (iOS `ShareSheetView.toolActions`) —
     * `null` quand elle ne s'offre pas : le plan de partage doit offrir « Imager » (une citation protégée le retient) ET la
     * discussion qui mène au message doit avoir de quoi se peindre.
     */
    fun offeredEnd(forward: ForwardUiState, messages: List<BubbleContent>, nowMillis: Long): String? = forward.sourceMessageId.takeIf {
        forward.refusal == null && forward.plan?.offers(ShareAction.IMAGER) == true && offers(messages, it, nowMillis)
    }

    fun subject(window: List<BubbleContent>, viewer: CardViewer, title: String?, defaultTitle: String): CardSubject? {
        val last = window.lastOrNull() ?: return null
        val lines = window.joinToString("\n") { "${author(it, viewer)} : ${said(it)}" }
        return CardSubject(
            quoted = null,
            reply = CardPart(author = CardText.nonBlank(title) ?: defaultTitle, text = lines),
            sentAtMillis = last.createdAtIso?.let { isoToEpochMillisOrNull(it) } ?: 0L,
            media = window.flatMap { CardMediaPicking.paintable(it) }.takeLast(MAX_MEDIA),
        )
    }

    private fun author(bubble: BubbleContent, viewer: CardViewer): String {
        val names = if (bubble.isOutgoing) listOf(viewer.displayName, bubble.senderName, bubble.senderUsername) else listOf(bubble.senderName, bubble.senderUsername)
        return names.firstNotNullOfOrNull { CardText.nonBlank(it) } ?: "Meeshy"
    }

    /** Le texte servi, ou — pour un message sans mots — ce que ses médias sont. */
    private fun said(bubble: BubbleContent): String =
        CardText.nonBlank(bubble.text)?.trim()
            ?: CardMediaPicking.paintable(bubble).joinToString(" ") { if (it.kind == CardMediaKind.VIDEO) "🎬" else "📷" }
}

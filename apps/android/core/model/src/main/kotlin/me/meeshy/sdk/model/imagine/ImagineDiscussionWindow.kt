package me.meeshy.sdk.model.imagine

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.quotesProtectedContent

/**
 * **« Imager la discussion »** (#9039) — la discussion qui MÈNE au message choisi devient une carte de l'atelier : une
 * ligne par message, « Auteur : texte », titrée du nom de la conversation, ses médias peignables posés dessous. Miroir
 * de `MessageCardDiscussion` (iOS).
 *
 * LE PÉRIMÈTRE, borné pour la mémoire : les [MAX_MESSAGES] derniers messages exportables jusqu'au message choisi COMPRIS
 * (ce qui le suit n'en fait pas partie), et au plus [MAX_MEDIA] médias, les plus récents.
 *
 * LES MÊMES GARDES qu'« Imager » un message ([ImagineRequestBuilder.refusal]). UNE RÉPONSE QUI CITE UN CONTENU PROTÉGÉ
 * dans la portée de la fenêtre ferme la discussion entière (décision porteur du 2026-10-08) : la sauter peindrait une
 * discussion trouée à l'endroit de ce qu'elle citait.
 */
object ImagineDiscussionWindow {
    const val MAX_MESSAGES = 12
    const val MAX_MEDIA = 4

    /** Les messages imagés, dans l'ordre du fil ([messages] du plus ancien au plus récent) — vide quand rien ne s'image. */
    fun window(messages: List<ApiMessage>, endingAt: String, nowMillis: Long, conversationIsEncrypted: Boolean = false): List<ApiMessage> {
        val end = messages.indexOfFirst { it.id == endingAt }.takeIf { it >= 0 } ?: return emptyList()
        val upTo = messages.subList(0, end + 1)
        val exportable = upTo.filter { ImagineRequestBuilder.isExportable(it, nowMillis, null, conversationIsEncrypted) }.takeLast(MAX_MESSAGES)
        val first = exportable.firstOrNull() ?: return emptyList()
        val start = upTo.indexOfFirst { it.id == first.id }
        if (upTo.subList(start, upTo.size).any { it.quotesProtectedContent }) return emptyList()
        return exportable
    }

    /** « Imager la discussion » ne s'offre que si la fenêtre a quelque chose à peindre : un bouton qui n'ouvrirait rien n'est pas rendu. */
    fun offers(messages: List<ApiMessage>, endingAt: String, nowMillis: Long, conversationIsEncrypted: Boolean = false): Boolean =
        window(messages, endingAt, nowMillis, conversationIsEncrypted).isNotEmpty()

    /**
     * Le sujet de la discussion. [servedText] est le texte que le lecteur a sous les yeux pour chaque message (Prisme),
     * `null` : l'original. Chaque média garde l'auteur de SON message.
     */
    fun subject(
        window: List<ApiMessage>,
        servedText: (ApiMessage) -> String?,
        viewer: ImagineViewer,
        title: String?,
        defaultTitle: String,
    ): ImagineSubject? {
        val last = window.lastOrNull() ?: return null
        val lines = window.joinToString("\n") { "${author(it, viewer)} : ${said(it, servedText(it))}" }
        val media = window.flatMap { message ->
            val by = mediaAuthor(message, viewer)
            ImagineRequestBuilder.paintableMedia(message).map { it.by(by) }
        }.takeLast(MAX_MEDIA)
        return ImagineSubject(
            quoted = null,
            reply = ImaginePart(author = ImagineRequestBuilder.text(title) ?: defaultTitle, text = lines),
            sentAtMillis = last.createdAt?.let { isoToEpochMillisOrNull(it) } ?: 0L,
            media = media,
        )
    }

    /** La requête de l'atelier depuis la discussion chargée — `null` quand rien ne s'image. Une seule langue, pas de rapide. */
    fun request(
        messages: List<ApiMessage>,
        endingAt: String,
        servedText: (ApiMessage) -> String?,
        viewer: ImagineViewer,
        handle: String?,
        conversationTitle: String?,
        defaultTitle: String,
        accentColor: String,
        nowMillis: Long,
        conversationIsEncrypted: Boolean = false,
    ): ImagineRequest? {
        val window = window(messages, endingAt, nowMillis, conversationIsEncrypted)
        val subject = subject(window, servedText, viewer, conversationTitle, defaultTitle) ?: return null
        return ImagineRequest(subject, emptyList(), handle, conversationTitle, accentColor, quick = false)
    }

    private fun isViewer(message: ApiMessage, viewer: ImagineViewer): Boolean =
        ImagineRequestBuilder.isViewer(message.senderId ?: message.sender?.resolvedUserId, viewer)

    private fun author(message: ApiMessage, viewer: ImagineViewer): String = ImagineRequestBuilder.author(
        isViewer(message, viewer),
        listOf(ImagineRequestBuilder.senderName(message), ImagineRequestBuilder.senderUsername(message)),
        viewer,
    )

    private fun mediaAuthor(message: ApiMessage, viewer: ImagineViewer): ImagineMediaAuthor = ImagineMediaAuthor(
        name = author(message, viewer),
        handle = if (isViewer(message, viewer)) viewer.username ?: ImagineRequestBuilder.senderUsername(message) else ImagineRequestBuilder.senderUsername(message),
    )

    /** Le texte servi, ou — pour un message sans mots — ce que ses médias sont. */
    private fun said(message: ApiMessage, served: String?): String =
        ImagineRequestBuilder.text(served ?: message.content)
            ?: ImagineRequestBuilder.paintableMedia(message).joinToString(" ") { symbol(it.kind) }

    private fun symbol(kind: ImagineMediaKind): String = when (kind) {
        ImagineMediaKind.IMAGE -> "📷"
        ImagineMediaKind.VIDEO -> "🎬"
        ImagineMediaKind.AUDIO -> "🎤"
    }
}

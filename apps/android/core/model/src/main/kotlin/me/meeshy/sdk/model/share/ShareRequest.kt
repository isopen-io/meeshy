package me.meeshy.sdk.model.share

/**
 * **Ce qu'une porte demande à l'écran de partage unique** (#15688) : un sujet et ce que l'arrivée a laissé
 * derrière elle. L'activité « Partager vers Meeshy » n'a plus de sélecteur propre : elle construit UNE
 * [ShareRequest] et la remet à la feuille, comme le font le fil, une story, un post ou un profil.
 */
data class ShareRequest(
    val subject: ShareSubject,
    /** Les pièces écartées à l'arrivée (source refusée, trop lourd, non préparé), dites dans « Ce qui part ». */
    val shortfalls: List<ShareShortfall> = emptyList(),
) {
    enum class Source { MESSAGES, PIECE, TEXT, LINK, CARD, INCOMING }

    val source: Source
        get() = when (subject) {
            is ShareSubject.Messages -> Source.MESSAGES
            is ShareSubject.Piece -> Source.PIECE
            is ShareSubject.Text -> Source.TEXT
            is ShareSubject.Link -> Source.LINK
            is ShareSubject.Card -> Source.CARD
            is ShareSubject.Incoming -> Source.INCOMING
        }

    companion object {
        fun of(subject: ShareSubject): ShareRequest = ShareRequest(subject)

        /** Le partage d'une autre app ; sans texte ni fichier, la feuille n'a rien à envoyer et ne s'ouvre pas. */
        fun incoming(text: String?, media: List<ShareMedia>, shortfalls: List<ShareShortfall> = emptyList()): ShareRequest? {
            val body = text?.trim()?.takeIf { it.isNotEmpty() }
            if (body == null && media.isEmpty()) return null
            return ShareRequest(ShareSubject.Incoming(body, media), shortfalls)
        }

        /** Le résultat de la collecte des fournisseurs ([ShareIntake.gathered]) devient une demande, médias numérotés dans l'ordre d'envoi. */
        fun from(gathered: ShareGathered): ShareRequest? = incoming(
            text = gathered.content,
            media = gathered.media.mapIndexed { index, staged ->
                ShareMedia(id = "incoming:$index", mimeType = staged.mime, bytes = staged.bytes)
            },
            shortfalls = gathered.shortfalls,
        )
    }
}

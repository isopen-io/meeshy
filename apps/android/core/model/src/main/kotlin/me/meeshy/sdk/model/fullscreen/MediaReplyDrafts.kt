package me.meeshy.sdk.model.fullscreen

/**
 * **Un brouillon de réponse PAR PIÈCE** (iOS `replyDrafts: [String: String]`) : refermer la barre, tourner la page ou
 * rouvrir le plein écran rend le texte tel qu'on l'a laissé (« en sortir rend le média intact, brouillon compris »).
 * Valeur immuable ; un texte vide ne garde pas de clé.
 */
public data class MediaReplyDrafts(val byPiece: Map<String, String> = emptyMap()) {

    public fun draft(pieceId: String): String = byPiece[pieceId].orEmpty()

    public fun editing(pieceId: String, text: String): MediaReplyDrafts =
        if (text.isEmpty()) sent(pieceId) else copy(byPiece = byPiece + (pieceId to text))

    /** La réponse est partie : le brouillon de cette pièce, et d'elle seule, est vidé. */
    public fun sent(pieceId: String): MediaReplyDrafts = copy(byPiece = byPiece - pieceId)
}

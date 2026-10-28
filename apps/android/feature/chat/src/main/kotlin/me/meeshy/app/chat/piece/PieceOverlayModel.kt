package me.meeshy.app.chat.piece

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.piece.MessagePieceTarget

/** Une page de l'aperçu d'une pièce : une tuile du message, à son ratio. [url] est nulle pour une pièce protégée (aucun pixel chargé). */
@Immutable
internal data class PiecePage(
    val attachmentId: String,
    val url: String?,
    val ratio: Float,
    val isVideo: Boolean,
    val isProtected: Boolean,
    val alt: String?,
)

/**
 * **L'aperçu d'UNE pièce** (directive porteur 2026-10-10, miroir de `MessagePieceOverlay`, iOS) : les tuiles du message,
 * la pièce pressée en première page, et ce que le menu offre pour la page affichée. Construit par la loi pure
 * [MessagePieceTarget] ; `null` quand le message est protégé — l'appui long retombe alors sur le message entier.
 */
@Immutable
internal data class PieceOverlayModel(
    val messageId: String,
    val pages: List<PiecePage>,
    val startIndex: Int,
    private val canReply: Boolean,
) {
    fun actionsFor(index: Int): List<MessagePieceTarget.Action> =
        MessagePieceTarget.actions(isProtected = pages.getOrNull(index)?.isProtected ?: true, canReply = canReply)

    companion object {
        /** Une conversation chiffrée de bout en bout n'ouvre aucun aperçu de pièce : ce téléphone n'en déchiffre pas les blobs. */
        fun of(
            message: ApiMessage,
            attachmentId: String,
            canReply: Boolean,
            conversationIsEndToEnd: Boolean = false,
            resolveUrl: (String) -> String,
        ): PieceOverlayModel? {
            if (conversationIsEndToEnd) return null
            MessagePieceTarget.piece(attachmentId, message) ?: return null
            val pieces = MessagePieceTarget.pieces(message)
            val pages = pieces.map { piece ->
                val protected = MessagePieceTarget.isProtected(piece, message)
                val source = piece.fileUrl?.takeIf { it.isNotBlank() } ?: piece.thumbnailUrl
                PiecePage(
                    attachmentId = piece.id,
                    url = if (protected) null else source?.let(resolveUrl),
                    ratio = ratioOf(piece.width, piece.height),
                    isVideo = piece.mimeType?.startsWith("video/") == true,
                    isProtected = protected,
                    alt = piece.alt?.takeIf { it.isNotBlank() },
                )
            }
            val start = pages.indexOfFirst { it.attachmentId == attachmentId }.coerceAtLeast(0)
            return PieceOverlayModel(message.id, pages, start, canReply)
        }

        private fun ratioOf(width: Int?, height: Int?): Float =
            if (width != null && height != null && width > 0 && height > 0) width.toFloat() / height else 1f
    }
}

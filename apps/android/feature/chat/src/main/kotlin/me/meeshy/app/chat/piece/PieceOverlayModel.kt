package me.meeshy.app.chat.piece

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.ObjectIdGuard
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.piece.MessagePieceTarget
import me.meeshy.sdk.model.piece.PieceDeletion

/** Une page de l'aperçu d'une pièce : une tuile du message, à son ratio. [url] est nulle pour une pièce protégée (aucun pixel chargé). */
@Immutable
internal data class PiecePage(
    val attachmentId: String,
    val url: String?,
    val ratio: Float,
    val isVideo: Boolean,
    val isProtected: Boolean,
    val alt: String?,
    /** Les emojis que CE lecteur a déjà posés sur la pièce — la bande de réactions les marque. */
    val ownReactions: Set<String> = emptySet(),
)

/**
 * Les actions de la pièce dont l'effet est BRANCHÉ sur cet appareil (#13494) : une action sans effet reste absente du menu,
 * jamais grisée. L'hôte déclare ici ce qu'il sait faire ; la loi ([MessagePieceTarget.actions]) dit ce que le lecteur a le droit de faire.
 */
@Immutable
internal data class PieceCapabilities(
    val canForward: Boolean = false,
    val canCopy: Boolean = false,
    val canDelete: Boolean = false,
    val canReact: Boolean = false,
) {
    companion object {
        /**
         * Ce que cet appareil SAIT faire d'une pièce de [message], lu par le menu avec la loi (#13596). Une action dont
         * l'effet n'existe pas reste fausse — jamais grisée :
         *
         * - transférer : un message accusé, vivant, en clair — la passerelle recopie la pièce choisie ;
         * - réagir : le droit d'écrire, sur un message accusé et vivant (la passerelle n'accepte pas une bulle locale) ;
         * - supprimer : SON message accusé, vivant, hors conversation chiffrée (`DELETE /attachments/:id`) ;
         * - copier : jamais — iOS n'offre pas de « Copier » sur une pièce seule, et aucune URI de presse-papiers sûre
         *   n'existe pour un fichier téléchargé.
         */
        fun of(message: ApiMessage, viewerId: String?, viewerMayWrite: Boolean, conversationIsEndToEnd: Boolean): PieceCapabilities {
            val acknowledged = !ObjectIdGuard.isLocalId(message.id) && message.deletedAt.isNullOrBlank()
            return PieceCapabilities(
                canForward = acknowledged && !conversationIsEndToEnd,
                canCopy = false,
                canDelete = PieceDeletion.mayDelete(message, viewerId, conversationIsEndToEnd),
                canReact = acknowledged && viewerMayWrite && !conversationIsEndToEnd,
            )
        }
    }
}

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
    private val exits: MessageExitOffer = MessageExitOffer.Unrestricted,
    private val capabilities: PieceCapabilities = PieceCapabilities(),
) {
    private fun menuFor(index: Int) = MessagePieceTarget.MenuContext(
        isProtected = pages.getOrNull(index)?.isProtected ?: true,
        exits = exits,
        canDelete = capabilities.canDelete,
        canForward = capabilities.canForward,
        canReply = canReply,
        canReact = capabilities.canReact,
        canCopy = capabilities.canCopy,
    )

    fun actionsFor(index: Int): List<MessagePieceTarget.Action> = MessagePieceTarget.actions(menuFor(index))

    /** La bande de réactions de la pièce AFFICHÉE : même verdict que celle du message, jamais sur une pièce protégée. */
    fun offersReaction(index: Int): Boolean = MessagePieceTarget.offersReaction(menuFor(index))

    companion object {
        /** Une conversation chiffrée de bout en bout n'ouvre aucun aperçu de pièce : ce téléphone n'en déchiffre pas les blobs. */
        fun of(
            message: ApiMessage,
            attachmentId: String,
            canReply: Boolean,
            conversationIsEndToEnd: Boolean = false,
            capabilities: PieceCapabilities = PieceCapabilities(),
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
                    ownReactions = piece.currentUserReactions.orEmpty().toSet(),
                )
            }
            val start = pages.indexOfFirst { it.attachmentId == attachmentId }.coerceAtLeast(0)
            return PieceOverlayModel(message.id, pages, start, canReply, message.exitOffer(conversationIsEncrypted = conversationIsEndToEnd), capabilities)
        }

        private fun ratioOf(width: Int?, height: Int?): Float =
            if (width != null && height != null && width > 0 && height > 0) width.toFloat() / height else 1f
    }
}

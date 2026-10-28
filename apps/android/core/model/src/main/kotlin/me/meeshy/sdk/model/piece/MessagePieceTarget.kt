package me.meeshy.sdk.model.piece

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.exitOffer

/**
 * **Ce qu'un appui long sur une PIÈCE désigne, et ce qu'il a le droit d'atteindre** (miroir de `MessagePieceTarget`,
 * iOS, directive porteur 2026-10-10). Une règle pure : l'aperçu d'une pièce, la feuille « Plus… » et le plein écran
 * posent la même question à la même fonction.
 */
object MessagePieceTarget {

    /** Ce que le menu d'une pièce peut offrir. « Tout le message » ferme toujours la liste. */
    enum class Action { REPLY, WHOLE_MESSAGE }

    data class Size(val width: Float, val height: Float)

    /** Les pièces que l'aperçu fait défiler : les tuiles du message — photos et vidéos — dans l'ordre du message. */
    fun pieces(message: ApiMessage): List<ApiMessageAttachment> =
        message.attachments.filter { it.mimeType?.startsWith("image/") == true || it.mimeType?.startsWith("video/") == true }

    /**
     * La pièce visée, si elle est bien une tuile de CE message. FAIL-CLOSED sur le message : un message protégé
     * n'ouvre jamais l'aperçu d'une pièce, même quand la pièce ne porte aucun drapeau (cache ancien, envoi optimiste).
     */
    fun piece(attachmentId: String?, message: ApiMessage): ApiMessageAttachment? {
        if (attachmentId == null || messageIsProtected(message)) return null
        return pieces(message).firstOrNull { it.id == attachmentId }
    }

    /**
     * Le message retient-il son contenu ? Vue unique, flou (du message ou d'une pièce), chiffrement, et la loi de
     * sortie (flamme) : un contenu qui ne peut pas sortir ne se montre pas en clair, pièce par pièce, dans un aperçu.
     */
    fun messageIsProtected(message: ApiMessage): Boolean =
        !message.exitOffer().offers(MessageExit.SAVE) ||
            message.isViewOnce == true ||
            message.isBlurred == true ||
            message.attachments.any { isProtectedPiece(it) }

    /** Une pièce se montre-t-elle en clair ? Non dès qu'elle, ou son message, est à vue unique, floutée ou chiffrée. */
    fun isProtected(piece: ApiMessageAttachment, message: ApiMessage): Boolean =
        isProtectedPiece(piece) || messageIsProtected(message)

    private fun isProtectedPiece(piece: ApiMessageAttachment): Boolean =
        piece.isViewOnce == true || piece.isBlurred == true || piece.isEncrypted == true ||
            ((piece.effectFlags ?: 0L) != 0L)

    fun index(attachmentId: String, message: ApiMessage): Int? =
        pieces(message).indexOfFirst { it.id == attachmentId }.takeIf { it >= 0 }

    /** L'indicateur visible : « 3/7 ». */
    fun position(index: Int, count: Int): String = "${index + 1}/${maxOf(count, index + 1)}"

    /** La pièce suivante (`step = 1`) ou précédente (`-1`), bornée aux tuiles du message. */
    fun neighbour(attachmentId: String, step: Int, message: ApiMessage): String? {
        val all = pieces(message)
        val current = all.indexOfFirst { it.id == attachmentId }.takeIf { it >= 0 } ?: return null
        return all.getOrNull(current + step)?.id
    }

    /** La plus grande taille qui tient dans la scène sans changer le rapport largeur/hauteur. Ratio inconnu : un carré. */
    fun fittedSize(ratio: Float, boundsWidth: Float, boundsHeight: Float): Size {
        if (boundsWidth <= 0f || boundsHeight <= 0f) return Size(0f, 0f)
        val safe = if (ratio > 0f) ratio else 1f
        val byWidth = Size(boundsWidth, boundsWidth / safe)
        return if (byWidth.height > boundsHeight) Size(boundsHeight * safe, boundsHeight) else byWidth
    }

    /**
     * Répondre atteint la pièce AFFICHÉE ; une pièce protégée ne se cite pas (sa forme se montre, jamais son contenu) ;
     * la citation suit le droit d'écrire du lecteur. « Tout le message » est toujours là.
     */
    fun actions(isProtected: Boolean, canReply: Boolean): List<Action> = buildList {
        if (!isProtected && canReply) add(Action.REPLY)
        add(Action.WHOLE_MESSAGE)
    }
}

package me.meeshy.sdk.model.analytics.capture

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ContentCaptureCandidate
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.contentExitLaw
import me.meeshy.sdk.model.isProtected

/**
 * Ce qu'une rangée de message MONTRE et qui se déclare — miroir de `ContentCaptureVisibility` (iOS).
 */
object ContentCaptureVisibility {

    /**
     * Le message lui-même, s'il n'est pas un avis ni supprimé — et une vue unique seulement RÉVÉLÉE sur place
     * ([isViewOnceRevealed]) : une bulle scellée ne montre rien, et la capture de l'écran qui la porte n'est pas une
     * tentative. Plus la citation qu'il porte, qui montre le texte ou la vignette de son cité.
     *
     * [serverId] : l'identifiant serveur quand la ligne en a reçu un ; [viewerUserId] : le lecteur (sa propre capture ne
     * s'annonce pas).
     */
    fun candidates(
        message: ApiMessage,
        viewerUserId: String?,
        isViewOnceRevealed: Boolean = false,
        serverId: String? = null,
    ): List<ContentCaptureCandidate> {
        if (message.isSystemMessage || message.deletedAt != null) return emptyList()
        val law = message.contentExitLaw
        val own = if (law.nature != ContentExitLaw.Nature.VIEW_ONCE || isViewOnceRevealed) {
            listOf(
                ContentCaptureCandidate(
                    conversationId = message.conversationId,
                    messageId = serverId ?: message.id,
                    capture = law.capture,
                    isMine = isMine(message.sender?.resolvedUserId ?: message.senderId, viewerUserId),
                ),
            )
        } else {
            emptyList()
        }
        val quote = message.replyTo?.takeIf { it.id.isNotEmpty() && it.deletedAt == null } ?: return own
        return own + ContentCaptureCandidate(
            conversationId = message.conversationId,
            messageId = quote.id,
            capture = quotedCapture(quote),
            isMine = isMine(quote.authorUserId, viewerUserId),
        )
    }

    /**
     * La capture d'écran de la CITATION : elle suit la loi de son cité, même posée dans un message ordinaire. Un cité en
     * vue unique, flouté ou à média protégé est noir ; tout autre est ANNONCÉ — la citation ne dit pas toujours si son cité
     * est une flamme après lecture pas encore consommée, et la passerelle juge sur le cité réel (un cité ordinaire ne
     * produit aucun avis).
     */
    fun quotedCapture(quote: ApiMessageReplyPreview): ContentExitLaw.CaptureVerdict {
        val blurred = quote.isBlurred == true || ((quote.effectFlags ?: 0L) and MessageEffectFlags.BLURRED) != 0L
        val mediaProtected = quote.attachments.orEmpty().any { it.isProtected }
        return if (quote.isViewOnce == true || blurred || mediaProtected) {
            ContentExitLaw.CaptureVerdict.BLOCKED
        } else {
            ContentExitLaw.CaptureVerdict.ANNOUNCED
        }
    }

    private fun isMine(authorUserId: String?, viewerUserId: String?): Boolean =
        !authorUserId.isNullOrEmpty() && authorUserId == viewerUserId
}

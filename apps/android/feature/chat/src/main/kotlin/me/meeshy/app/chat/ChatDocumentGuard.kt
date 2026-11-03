package me.meeshy.app.chat

import me.meeshy.app.chat.fileviewer.FileViewerRequest
import me.meeshy.sdk.model.MessageExit
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce que le fil sait de la pièce qu'on ouvre : est-elle la mienne, est-elle protégée (vue unique, floutée, éphémère,
 * retenue par la loi de sortie), de quel poids. Une pièce absente du fil (ouverte depuis le hub, qui a déjà jugé la
 * sortie de son porteur) n'ajoute aucune restriction.
 */
internal fun FileViewerRequest.guardedBy(messages: List<BubbleContent>): FileViewerRequest {
    val carrier = messages.firstOrNull { bubble -> bubble.files.any { it.attachmentId == attachmentId } } ?: return this
    val file = carrier.files.first { it.attachmentId == attachmentId }
    val protected = file.isProtected || carrier.isViewOnce || carrier.isBlurred || carrier.blurReveal != null ||
        carrier.exitOffer.capture.shieldsCapture() || !carrier.exitOffer.offers(MessageExit.SAVE)
    return copy(isProtected = protected, isMine = carrier.isOutgoing, sizeBytes = file.sizeBytes)
}

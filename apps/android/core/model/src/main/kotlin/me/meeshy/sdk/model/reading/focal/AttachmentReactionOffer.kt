package me.meeshy.sdk.model.reading.focal

/**
 * À quelle pièce de la grille offre-t-on le double tap pour réagir (iOS `AttachmentReactionOffer`, surface grille) :
 * seulement si un rappel route l'émoji (un contrôle existe s'il a un effet), si la pièce n'est pas protégée, et si
 * elle n'est pas seule dans son message — une pièce seule garde un tap simple immédiat, sans fenêtre de
 * désambiguïsation, et laisse la réaction au message.
 */
object AttachmentReactionOffer {
    fun offersReaction(isSolo: Boolean, isProtected: Boolean, hasHandler: Boolean): Boolean =
        hasHandler && !isProtected && !isSolo
}

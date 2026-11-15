package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.MessageExitOffer

/**
 * **Le bouton Télécharger d'une page du plein écran audio** (iOS `downloadButton`, gardé par `ContentExitGated`) : il
 * n'existe que si le porteur laisse le vocal s'ENREGISTRER ([MessageExitOffer], la loi de sortie unique) et jamais dans une
 * conversation chiffrée de bout en bout. Une loi de sortie inconnue n'offre rien : échec fermé. Le circuit d'enregistrement
 * revérifie de toute façon — l'absence du bouton évite seulement de proposer ce qui serait refusé.
 */
public object AudioFullscreenDownloadOffer {

    public fun offers(exitOffer: MessageExitOffer?, conversationIsEndToEnd: Boolean): Boolean =
        !conversationIsEndToEnd && exitOffer?.offers(MessageExit.SAVE) == true
}

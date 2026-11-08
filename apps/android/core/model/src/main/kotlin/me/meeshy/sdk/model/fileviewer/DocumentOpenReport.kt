package me.meeshy.sdk.model.fileviewer

import me.meeshy.sdk.model.media.AttachmentStatusBody

/**
 * Ce qu'il faut remonter à l'OUVERTURE d'un document reçu (miroir de `DocumentOpenReport`, iOS, #7362) : `viewed`, pas
 * `downloaded`. L'onglet « Ouvert » de « Vu par » lit cette action ; `downloaded` garde son sens, l'enregistrement
 * explicite. Rien pour son propre document : un expéditeur qui relit son envoi ne s'auto-déclare pas destinataire.
 */
object DocumentOpenReport {
    fun bodyForOpening(isMine: Boolean): AttachmentStatusBody? =
        if (isMine) null
        else AttachmentStatusBody(action = AttachmentStatusBody.ACTION_VIEWED, playPositionMs = 0, durationMs = 0, complete = true)
}

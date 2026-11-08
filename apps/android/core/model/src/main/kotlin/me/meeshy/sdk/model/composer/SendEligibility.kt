package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.SharedPlace

/** Éligibilité d'envoi d'un message : texte non vide (après trim), au moins une pièce, ou un lieu partagé. */
object SendEligibility {
    fun canSend(text: String, attachmentIds: List<String>, location: SharedPlace?): Boolean =
        text.isNotBlank() || attachmentIds.isNotEmpty() || location != null
}

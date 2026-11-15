package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.PresenceState

/** L'état d'envoi d'une ligne, tel que la vue le dit (miroir de `ShareDeliveryState`, iOS). */
enum class ShareRowStatus { SENDING, SENT, QUEUED, FAILED }

/**
 * **Ce qu'une ligne destinataire dessine** — pur et sans Compose. La présence n'est que celle que la
 * passerelle sert (amis acceptés) : une donnée absente ne dessine aucun point, et un groupe n'en a jamais.
 */
data class ShareRecipientRowModel(
    val recipient: ShareRecipient,
    val presence: PresenceState?,
    val selected: Boolean,
    val delivery: ShareDelivery?,
) {
    val status: ShareRowStatus?
        get() = when (delivery) {
            ShareDelivery.Sending -> ShareRowStatus.SENDING
            ShareDelivery.Sent -> ShareRowStatus.SENT
            ShareDelivery.Queued -> ShareRowStatus.QUEUED
            is ShareDelivery.Failed -> ShareRowStatus.FAILED
            null -> null
        }

    /** Une ligne déjà servie (ou en cours) est inerte ; un échec se retente. */
    val isServed: Boolean get() = delivery != null && delivery !is ShareDelivery.Failed

    val showsRetry: Boolean get() = delivery is ShareDelivery.Failed

    /** Offline = aucun point sur un avatar. */
    val showsPresenceDot: Boolean get() = presence != null && presence != PresenceState.OFFLINE

    val isOnline: Boolean get() = presence == PresenceState.ONLINE

    /**
     * Un seul nœud d'accessibilité : « Équipe Lyon, Groupe · 12 membres, sélectionné ». Les mots viennent
     * de la vue (chaînes localisées) ; l'ordre, lui, est une loi.
     */
    fun spokenLabel(detail: String, onlineText: String, selectedText: String, statusText: String?): String {
        val parts = buildList {
            add(recipient.title)
            add(detail)
            if (isOnline) add(onlineText)
            if (statusText != null) add(statusText) else if (selected) add(selectedText)
        }
        return parts.joinToString(", ")
    }

    companion object {
        /** La présence d'une ligne : celle servie pour la personne, jamais pour un groupe ni sans identifiant. */
        fun presenceOf(recipient: ShareRecipient, served: (String) -> PresenceState?): PresenceState? {
            if (recipient.isGroup) return null
            val userId = recipient.userId ?: return null
            return served(userId)
        }
    }
}

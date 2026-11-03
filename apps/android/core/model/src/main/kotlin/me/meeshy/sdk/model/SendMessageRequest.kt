package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * **L'ANCRE qu'un ENVOI pose** : la pièce précise que cette réponse cite (#6164, moitié ÉCRITURE). Miroir de
 * `QuotedAttachmentSend` (iOS). Elle ne porte QUE l'identifiant : la nature est dérivée du MIME relu par la passerelle,
 * jamais de ce que le client déclare. Ne s'envoie qu'avec `replyToId`, et reste sur le POST REST (le socket ne la lit pas).
 */
@Serializable
data class QuotedAttachmentSend(val attachmentId: String) {
    companion object {
        /** Depuis ce que la citation a gravé ; `null` ou vide ⇒ la réponse vise le message entier (aucune clé sur le fil). */
        fun anchor(attachmentId: String?): QuotedAttachmentSend? =
            attachmentId?.takeIf { it.isNotEmpty() }?.let(::QuotedAttachmentSend)
    }
}

/**
 * Le corps de `POST /conversations/{id}/messages` — miroir de `SendMessageRequest` (iOS). Tout champ ajouté après la
 * première version est nullable (une vieille ligne d'outbox se décode ; une vieille passerelle ignore la clé).
 *
 * **Éphémère (#7451)** : la requête ne porte que `ephemeralDuration` et le bit d'effet ; l'échéance est calculée par
 * le serveur à l'arrivée. [expiresAt] n'est plus rempli par l'envoi (il reste décodable pour les lignes anciennes).
 */
@Serializable
data class SendMessageRequest(
    val content: String,
    val originalLanguage: String,
    val messageType: String = "text",
    val replyToId: String? = null,
    // Wire twin of `ApiMessage.storyReplyToId` — the RECEIVE side already carried it.
    val storyReplyToId: String? = null,
    val clientMessageId: String,
    val attachmentIds: List<String>? = null,
    val forwardedFromId: String? = null,
    val forwardedFromConversationId: String? = null,
    /**
     * Les seules pièces de `forwardedFromId` que la passerelle recopie (#9914, #13596) ; absent ⇒ tout le lot.
     * Une pièce étrangère au message source est refusée (`forwarded-attachment-not-in-source`).
     */
    val forwardedAttachmentIds: List<String>? = null,
    val effectFlags: Int? = null,
    val isBlurred: Boolean? = null,
    val isViewOnce: Boolean? = null,
    val ephemeralDuration: Int? = null,
    val expiresAt: String? = null,
    val maxViewOnceCount: Int? = null,
    /** Lieu partagé : champ dédié que la passerelle valide (`parseSharedPlace`) et écrit dans `metadata.location`. */
    val location: SharedPlace? = null,
    /**
     * Le sticker du message (#14334) : champ dédié que la passerelle valide (`parseMessageSticker`) et écrit dans
     * `metadata.sticker` ; l'image jointe en est le rendu de repli. Absent pour tout autre message.
     */
    val sticker: MessageSticker? = null,
    /** La pièce citée par la réponse (#6164) ; exige [replyToId], REST seulement. */
    val attachmentReplyTo: QuotedAttachmentSend? = null,
    /**
     * Fan-out de partage : le serveur crée de NOUVELLES pièces pointant les MÊMES fichiers que celles de ce message, sans
     * écrire `forwardedFromId` (aucun badge « Transféré »). Réutiliser les `attachmentIds` de la source les DÉPLACERAIT.
     */
    val copyAttachmentsFromMessageId: String? = null,
    /** Conversation chiffrée de bout en bout : `true` seulement, jamais `false` (absent = clair). */
    val isEncrypted: Boolean? = null,
    val encryptionMode: String? = null,
)

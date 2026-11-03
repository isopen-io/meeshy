package me.meeshy.sdk.model.appearance

import me.meeshy.sdk.model.AttachmentProtection
import me.meeshy.sdk.model.AttachmentProtectionVerdict

/**
 * Que faire d'une photo de fond qui ne vient pas ? (#10707, #10706) — miroir de `ConversationBackgroundPhotoVerdict`
 * (iOS) : une panne PASSAGÈRE garde la dernière photo peinte ; seule une pièce disparue ou refusée (403, 404, 410) rend le
 * fond à Signature. Une pièce CHIFFRÉE n'est jamais demandée au réseau (le serveur ne sert que le chiffré, l'appareil n'a pas
 * de clé de pièce) : Signature, seulement faute de clé.
 */
enum class ConversationBackgroundPhotoVerdict {
    GONE,
    TRANSIENT,
    ;

    /** D'où la photo se lit : en clair par le réseau, ou chiffrée donc dépendante d'une clé de l'appareil. */
    enum class Source { CLEAR, NEEDS_DEVICE_KEY }

    companion object {
        private val GONE_STATUSES = setOf(403, 404, 410)

        fun of(httpStatus: Int?): ConversationBackgroundPhotoVerdict =
            if (httpStatus != null && httpStatus in GONE_STATUSES) GONE else TRANSIENT

        fun source(isEncrypted: Boolean?): Source = if (isEncrypted == true) Source.NEEDS_DEVICE_KEY else Source.CLEAR

        /** Un verdict arrive APRÈS le réseau : il ne tranche que si la photo sondée est encore celle du fond. */
        fun settles(probedAttachmentId: String, current: ConversationBackgroundResolution): Boolean =
            current is ConversationBackgroundResolution.Photo && current.attachmentId == probedAttachmentId

        /** Le sélecteur ne propose pas une photo qu'il ne saurait pas peindre. */
        fun mayBeOffered(isEncrypted: Boolean?, isViewOnce: Boolean?, isBlurred: Boolean?, effectFlags: Long? = null): Boolean =
            isEncrypted != true &&
                AttachmentProtection.verdict(isViewOnce, isBlurred, effectFlags) != AttachmentProtectionVerdict.Masked
    }
}

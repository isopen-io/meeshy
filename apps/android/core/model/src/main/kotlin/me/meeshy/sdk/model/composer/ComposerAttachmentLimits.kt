package me.meeshy.sdk.model.composer

/** Plafonds du plateau de pièces en attente — miroir des bornes du composer iOS. */
object ComposerAttachmentLimits {

    /** Nombre maximal de médias en attente dans un même plateau (la 200e est refusée). */
    const val MAX_PENDING_ATTACHMENTS: Int = 199

    /**
     * Plafond d'une pièce envoyée par Android, en mégaoctets : le seuil d'envoi direct
     * (`SMALL_FILE_THRESHOLD`, `packages/shared/types/attachment.ts`). Au-delà, les autres
     * clients passent par l'envoi en continu (TUS), qu'Android n'a pas encore ; la file
     * d'envoi tenant la pièce en mémoire, la laisser entrer ferait planter l'app.
     */
    const val MAX_UPLOAD_MEGABYTES: Int = 50

    const val MAX_UPLOAD_BYTES: Long = MAX_UPLOAD_MEGABYTES * 1024L * 1024L

    /** Une pièce de [sizeBytes] octets peut-elle partir ? Une taille inconnue (0) passe. */
    fun admitsUpload(sizeBytes: Long): Boolean = sizeBytes <= MAX_UPLOAD_BYTES
}

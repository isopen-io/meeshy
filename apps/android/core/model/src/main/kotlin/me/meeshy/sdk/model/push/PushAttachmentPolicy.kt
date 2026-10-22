package me.meeshy.sdk.model.push

/**
 * Ce que le service de notification a le DROIT d'attacher — miroir de
 * `NSEAttachmentPolicy` (iOS). Deux étages : le PRÉ-VOL regarde le mime et la taille
 * DÉCLARÉS (évite la requête), l'APRÈS-VOL la taille MESURÉE du fichier écrit sur
 * disque (un serveur n'est jamais tenu par ce qu'il annonce). Images et audio
 * seulement ; une vidéo n'obtient qu'une vignette, jamais le fichier.
 */
object PushAttachmentPolicy {

    const val MAX_ATTACHMENT_BYTES: Long = 8L * 1024 * 1024

    private const val LIFECYCLE_FLAGS_MASK = 0b111

    fun mayAttach(mimeType: String, fileSize: Long?): Boolean {
        if (!isRenderableFamily(mimeType)) return false
        return fileSize == null || mayKeepDownloaded(fileSize)
    }

    fun mayKeepDownloaded(measuredBytes: Long): Boolean =
        measuredBytes > 0 && measuredBytes <= MAX_ATTACHMENT_BYTES

    fun isRenderableFamily(mimeType: String): Boolean {
        val base = baseType(mimeType)
        return base.startsWith("image/") || base.startsWith("audio/")
    }

    fun isAudioFamily(mimeType: String): Boolean = baseType(mimeType).startsWith("audio/")

    fun declaresProtection(data: Map<String, Any?>): Boolean {
        val key = (data["notificationLocKey"] as? String)?.trim()
        if (!key.isNullOrEmpty()) return true
        val flags = declaredInt(data["effectFlags"]) ?: return false
        return flags and LIFECYCLE_FLAGS_MASK.toLong() != 0L
    }

    fun declaresEphemeralDuration(data: Map<String, Any?>): Boolean =
        (declaredInt(data["ephemeralDuration"]) ?: 0L) > 0L

    /** Décision complète du pré-vol : jamais de téléchargement pour un message protégé. */
    fun shouldFetch(data: Map<String, Any?>, mimeType: String, fileSize: Long?): Boolean =
        !declaresProtection(data) &&
            !declaresEphemeralDuration(data) &&
            mayAttach(mimeType, fileSize)

    /** Un entier de la charge `data`, qu'il voyage en nombre ou en chaîne. */
    fun declaredInt(raw: Any?): Long? = when (raw) {
        is Number -> raw.toLong()
        is String -> raw.trim().toLongOrNull()
        else -> null
    }

    private fun baseType(mimeType: String): String =
        mimeType.substringBefore(';').trim().lowercase()
}

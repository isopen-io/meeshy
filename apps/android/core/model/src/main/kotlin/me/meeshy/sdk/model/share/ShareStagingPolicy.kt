package me.meeshy.sdk.model.share

/**
 * **Les règles pures de la copie d'un partage entrant** — miroir de `ShareMediaStaging.requiredFreeBytes`,
 * `copyBufferSize` (iOS) et de l'expiration des fiches (`SharePendingShare.EXPIRY_MILLIS`).
 *
 * La copie se fait par tranches de [COPY_BUFFER_BYTES] : aucun tableau de la taille du fichier n'existe jamais,
 * une vidéo de 400 Mo passe donc par 64 Kio de mémoire. Un disque plein en cours de copie produirait une pièce
 * tronquée livrée sans un mot : l'espace libre se contrôle AVANT le premier octet, marge comprise.
 */
object ShareStagingPolicy {
    const val COPY_BUFFER_BYTES: Int = 64 * 1024

    /** L'espace qui doit rester libre APRÈS la copie (`ShareUploadBudget.freeSpaceMarginBytes`, iOS). */
    const val FREE_SPACE_MARGIN_BYTES: Long = 128L * 1024L * 1024L

    /** Un dossier de copies que rien ne décrit vit au plus aussi longtemps qu'une fiche. */
    const val ORPHAN_TTL_MILLIS: Long = SharePendingShare.EXPIRY_MILLIS

    /** Les octets libres qu'il faut pour copier [size] octets ; une taille inconnue (négative) ne compte que la marge. */
    fun requiredFreeBytes(size: Long): Long = maxOf(0L, size) + FREE_SPACE_MARGIN_BYTES

    /** Pourquoi la copie de [size] octets est refusée par le disque, ou `null` si elle passe. */
    fun spaceRefusal(size: Long, freeBytes: Long): ShareStagingError.InsufficientFreeSpace? {
        val needed = requiredFreeBytes(size)
        return if (freeBytes >= needed) null else ShareStagingError.InsufficientFreeSpace(needed, freeBytes)
    }

    /**
     * Un dossier de copies est un ORPHELIN quand aucune fiche ne le décrit et que sa dernière activité remonte
     * à [ORPHAN_TTL_MILLIS] ou plus. Une fiche vivante protège toujours ses fichiers : la reprise les attend.
     */
    fun isOrphan(lastActivityEpochMillis: Long, nowEpochMillis: Long, holdsPendingRecord: Boolean): Boolean =
        !holdsPendingRecord && nowEpochMillis - lastActivityEpochMillis >= ORPHAN_TTL_MILLIS
}

package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.composer.ComposerAttachmentLimits

/**
 * **Les règles pures de la copie d'un partage entrant** — miroir de `ShareMediaStaging.requiredFreeBytes` et
 * `copyBufferSize` (iOS).
 *
 * La copie se fait par tranches de [COPY_BUFFER_BYTES] : aucun tableau de la taille du fichier n'existe jamais,
 * une vidéo de 40 Mo passe donc par 64 Kio de mémoire. Un disque plein en cours de copie produirait une pièce
 * tronquée livrée sans un mot : l'espace libre se contrôle AVANT le premier octet, marge comprise, puis à chaque
 * palier de [SPACE_RECHECK_BYTES] que la copie atteint.
 *
 * La copie part AVANT tout geste de l'utilisateur (l'écran montre ce qui partira) : une app tierce peut donc la
 * déclencher. Elle est bornée en conséquence, plus bas qu'iOS, qui a l'envoi en continu : une pièce au plus
 * [MAX_FILE_BYTES] (le seuil d'envoi direct d'Android, celui du composeur), et toutes les copies anticipées vivantes,
 * tous partages confondus, au plus [MAX_STAGED_BYTES].
 */
object ShareStagingPolicy {
    const val COPY_BUFFER_BYTES: Int = 64 * 1024

    /** L'espace qui doit rester libre APRÈS la copie (`ShareUploadBudget.freeSpaceMarginBytes`, iOS). */
    const val FREE_SPACE_MARGIN_BYTES: Long = 128L * 1024L * 1024L

    /** Le pas du contrôle d'espace libre pendant la copie. */
    const val SPACE_RECHECK_BYTES: Long = 16L * 1024L * 1024L

    /** Une pièce plus lourde ne partirait pas : Android n'a que l'envoi direct (pas de TUS). */
    const val MAX_FILE_BYTES: Long = ComposerAttachmentLimits.MAX_UPLOAD_BYTES

    /** Le plafond de TOUTES les copies anticipées vivantes, dans le cache : jamais les 5 Gio qu'un partage peut annoncer. */
    const val MAX_STAGED_BYTES: Long = 512L * 1024L * 1024L

    /** Les octets libres qu'il faut pour copier [size] octets ; une taille inconnue (négative) ne compte que la marge. */
    fun requiredFreeBytes(size: Long): Long = maxOf(0L, size) + FREE_SPACE_MARGIN_BYTES

    /** Pourquoi la copie de [size] octets est refusée par le disque, ou `null` si elle passe. */
    fun spaceRefusal(size: Long, freeBytes: Long): ShareStagingError.InsufficientFreeSpace? {
        val needed = requiredFreeBytes(size)
        return if (freeBytes >= needed) null else ShareStagingError.InsufficientFreeSpace(needed, freeBytes)
    }

    /**
     * Le prochain palier où l'espace libre se recontrôle, une fois [total] octets copiés : le premier multiple de
     * [SPACE_RECHECK_BYTES] strictement au-delà. Un cumul qui saute un multiple (lectures de taille quelconque) déclenche
     * quand même le contrôle, puisqu'on compare `cumul ≥ palier`, jamais `cumul == multiple`.
     */
    fun nextSpaceCheck(total: Long): Long = (maxOf(0L, total) / SPACE_RECHECK_BYTES + 1) * SPACE_RECHECK_BYTES
}

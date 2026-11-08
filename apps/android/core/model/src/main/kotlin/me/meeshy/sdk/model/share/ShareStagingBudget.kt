package me.meeshy.sdk.model.share


/**
 * **Le budget CUMULÉ des copies d'un partage** (#11429) — miroir de `ShareByteBudget` (iOS) auquel
 * s'ajoute le plafond de fichiers. Les copies partent en parallèle, avant l'écran : chaque copie
 * réserve ici ses octets, de façon atomique ; ce qui dépasse n'est pas copié, et l'écran le dit.
 */
class ShareStagingBudget(
    val maxBytes: Long = ShareLimits.MAX_TOTAL_BYTES,
    val maxFiles: Int = ShareLimits.MAX_FILES,
) {
    private val lock = Any()
    private var bytes = 0L
    private var files = 0

    val reservedBytes: Long get() = synchronized(lock) { bytes }
    val reservedFiles: Int get() = synchronized(lock) { files }

    /** Réserve un fichier de [size] octets si le cumul reste sous les DEUX plafonds ; rien sinon. */
    fun reserveFile(size: Long): Boolean = synchronized(lock) {
        if (size < 0 || files >= maxFiles || size > maxBytes - bytes) return false
        files += 1
        bytes += size
        true
    }

    /** Étend la réservation d'une copie dont la lecture dépasse la taille annoncée. */
    fun reserveMore(extra: Long): Boolean = synchronized(lock) {
        if (extra < 0 || extra > maxBytes - bytes) return false
        bytes += extra
        true
    }

    fun release(size: Long, file: Boolean = false) {
        synchronized(lock) {
            bytes = maxOf(0L, bytes - maxOf(0L, size))
            if (file) {
                files = maxOf(0, files - 1)
            }
        }
    }

    /** Pourquoi la prochaine copie de [size] octets est refusée, ou `null` si elle passe. */
    fun refusalFor(size: Long): ShareStagingError? = synchronized(lock) {
        when {
            files >= maxFiles -> ShareStagingError.FileCountExceeded(files + 1, maxFiles)
            size < 0 || size > maxBytes - bytes -> ShareStagingError.ByteBudgetExceeded(bytes + size, maxBytes)
            else -> null
        }
    }
}

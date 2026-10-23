package me.meeshy.sdk.media

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.mediacache.MediaCacheKey
import me.meeshy.sdk.model.mediacache.MediaPinTable
import java.io.File

/**
 * Magasin d'épingles d'UN dossier de cache, persisté dans le sidecar caché `.pins.json` pour
 * qu'un balayage au boot n'évince pas une épingle du lancement précédent. Brique sans décision :
 * il ne sait pas CE qui mérite une épingle (politique côté app). Écriture atomique (fichier
 * temporaire puis renommage) ; un sidecar illisible repart d'une table vide.
 */
class MediaPinStore(
    private val directory: File,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val mutex = Mutex()
    private var table: MediaPinTable? = null

    private val sidecar: File get() = File(directory, MediaPinTable.SIDECAR_FILE_NAME)

    suspend fun pin(url: String, untilEpochMillis: Long) = update { it.pin(MediaCacheKey.of(url), untilEpochMillis) }

    suspend fun unpin(url: String) = update { it.unpin(MediaCacheKey.of(url)) }

    suspend fun isPinned(url: String): Boolean =
        mutex.withLock { loaded().isPinned(MediaCacheKey.of(url), clock()) }

    /** Table courante, échues élaguées (et persistées si quelque chose a été retiré). */
    suspend fun snapshot(): MediaPinTable = mutex.withLock {
        val current = loaded()
        val pruned = current.pruned(clock())
        if (pruned != current) persist(pruned)
        pruned
    }

    private suspend fun update(transform: (MediaPinTable) -> MediaPinTable) = mutex.withLock {
        persist(transform(loaded()))
    }

    private fun loaded(): MediaPinTable =
        table ?: MediaPinTable.decode(runCatching { sidecar.takeIf { it.exists() }?.readText() }.getOrNull())
            .also { table = it }

    private fun persist(next: MediaPinTable) {
        table = next
        runCatching {
            directory.mkdirs()
            val temp = File(directory, "${MediaPinTable.SIDECAR_FILE_NAME}.tmp")
            temp.writeText(next.encode())
            if (!temp.renameTo(sidecar)) {
                sidecar.writeText(next.encode())
                temp.delete()
            }
        }
    }
}

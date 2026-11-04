package me.meeshy.app.share

import java.io.File
import me.meeshy.sdk.model.share.ShareStagingPolicy

/**
 * **Le balayage des copies orphelines** (iOS : fiches et dossiers expirés d'un partage abandonné). Un dossier de copies
 * qu'aucune fiche ne décrit (partage annulé par un processus tué, envoi jamais tenté, sans session) part quand sa
 * dernière activité remonte à sept jours ([ShareStagingPolicy.ORPHAN_TTL_MILLIS]) ; une fiche vivante protège toujours
 * les siennes. Rend le nombre de dossiers effacés.
 */
class ShareStagingSweeper(
    private val mediaRoot: () -> File,
    private val holdsPendingRecord: (shareId: String) -> Boolean,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    fun sweep(): Int {
        val now = clock()
        return mediaRoot().listFiles().orEmpty()
            .filter { it.isDirectory }
            .filter { ShareStagingPolicy.isOrphan(lastActivity(it), now, holdsPendingRecord(it.name)) }
            .count { it.deleteRecursively() }
    }

    /** La plus récente des modifications du dossier et de ses fichiers : une copie en cours le garde jeune. */
    private fun lastActivity(directory: File): Long =
        maxOf(directory.lastModified(), directory.listFiles().orEmpty().maxOfOrNull { it.lastModified() } ?: 0L)
}

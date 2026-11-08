package me.meeshy.sdk.media

import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import javax.inject.Inject

/**
 * Le balayage des médias en file (#14710). Deux gestes, dans cet ordre, au démarrage :
 * - un envoi `pending` dont le fichier a disparu (ou ne s'ouvre plus) passe `failed` : le flusher ne rejoue jamais
 *   contre un fichier absent, l'état est porté par la pastille « échec », pas par une boucle d'erreurs ;
 * - une ligne de blob que plus aucun envoi vivant ne nomme (envoi appliqué : sa ligne d'outbox a disparu) quitte le
 *   disque avec son fichier. Seules les lignes écrites avant [before] sont visées : un enfilage en cours n'est jamais touché.
 */
public class PendingMediaSweeper @Inject constructor(
    private val blobs: MediaBlobStore,
    private val outbox: OutboxRepository,
    private val outboxDao: OutboxDao,
) {
    public suspend fun sweep(before: Long) {
        outboxDao.byState(OutboxState.PENDING.name)
            .filter { it.kindEnum == OutboxKind.UPLOAD_MEDIA }
            .filter { blobs.get(it.cmid, it.ownerId) == null }
            .forEach { row ->
                outbox.markExhausted(row.cmid, REASON_FILE_MISSING)
                blobs.remove(row.cmid)
            }
        blobs.heldBefore(before).forEach { cmid ->
            if (outbox.row(cmid) == null) blobs.remove(cmid)
        }
    }

    public companion object {
        public const val REASON_FILE_MISSING: String = "media-file-missing"
    }
}

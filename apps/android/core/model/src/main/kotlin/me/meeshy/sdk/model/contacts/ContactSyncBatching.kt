package me.meeshy.sdk.model.contacts

/**
 * Decoupe et envoi du carnet par lots (port de `ContactSyncService`, iOS).
 *
 * Contrat partage avec la passerelle : le premier lot part sans jeton et rapporte l'horloge
 * SERVEUR ([DirectorySyncResult.syncStartedAt]) ; les suivants la repetent ; le dernier d'un
 * remplacement porte `isFinalBatch`, ce qui purge par filigrane. Aucun lot intermediaire
 * n'efface rien : une interruption laisse le repertoire intact. Un lot d'une decoupe voyage
 * toujours en fusion.
 */
object ContactSyncBatching {
    const val BATCH_SIZE = 2000

    /** Un carnet VIDE rend un lot vide (et non zero lot) : c'est lui qui dit « plus aucun contact ». */
    fun batches(entries: List<ContactMatchEntry>, size: Int = BATCH_SIZE): List<List<ContactMatchEntry>> {
        if (size <= 0) return listOf(entries)
        if (entries.isEmpty()) return listOf(emptyList())
        return entries.chunked(size)
    }

    suspend fun sync(
        entries: List<ContactMatchEntry>,
        mode: DirectorySyncMode,
        defaultCountry: String?,
        batchSize: Int = BATCH_SIZE,
        send: suspend (DirectorySyncRequest) -> DirectorySyncResult,
    ): DirectorySyncResult {
        val batches = batches(entries, batchSize)
        val singleShot = batches.size == 1
        var total = 0
        var processed = 0
        var synced = 0
        var matched = 0
        var removed = 0
        var token: String? = null

        batches.forEachIndexed { index, batch ->
            val isFinal = index == batches.lastIndex
            val result = send(
                DirectorySyncRequest(
                    contacts = batch,
                    defaultCountry = defaultCountry,
                    mode = if (singleShot) mode else DirectorySyncMode.Merge,
                    syncStartedAt = token,
                    isFinalBatch = if (isFinal && mode == DirectorySyncMode.Replace) true else null,
                ),
            )
            total += result.totalContacts
            processed += result.processedContacts
            synced += result.syncedCount
            matched += result.matchedCount
            if (isFinal) removed = result.removedCount

            if (index == 0) {
                val serverToken = result.syncStartedAt
                if (serverToken == null) {
                    if (!singleShot) {
                        return legacySingleShot(batch, defaultCountry, mode, entries.size - batch.size, send)
                    }
                    return DirectorySyncResult(total, processed, synced, matched, removed)
                }
                token = serverToken
            }
        }
        return DirectorySyncResult(total, processed, synced, matched, removed, token)
    }

    /** Passerelle sans contrat de lots : un seul envoi, jamais un remplacement sur un lot tronque. */
    private suspend fun legacySingleShot(
        batch: List<ContactMatchEntry>,
        defaultCountry: String?,
        mode: DirectorySyncMode,
        unsentCount: Int,
        send: suspend (DirectorySyncRequest) -> DirectorySyncResult,
    ): DirectorySyncResult = send(
        DirectorySyncRequest(
            contacts = batch,
            defaultCountry = defaultCountry,
            mode = if (unsentCount > 0) DirectorySyncMode.Merge else mode,
        ),
    )
}

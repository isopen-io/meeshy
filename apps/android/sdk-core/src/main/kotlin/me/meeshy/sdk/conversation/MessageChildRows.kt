package me.meeshy.sdk.conversation

import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.EditRevisionDao
import me.meeshy.core.database.dao.EphemeralReceiptDao
import me.meeshy.core.database.dao.MessageKeys
import me.meeshy.core.database.dao.PendingIdDao

/**
 * Every gate that REMOVES message rows takes their child rows with them, in its transaction (miroir de
 * `MessageChildRows.delete`, iOS) — the retained translations, transcriptions and audio tracks
 * ([DedicatedTranslationRows]), the edit history, the pending ids and the ephemeral receipts. None of them may keep the
 * text of a message that left: the retention purge, the recent window's prune, the thread purge and « Vider le cache »
 * ([me.meeshy.sdk.cache.purge.RoomCachePayloadStores]) share this one rule (audit A3, #19046, #19440 — the last three
 * dropped none of them).
 */
internal object MessageChildRows {

    suspend fun delete(
        database: MeeshyDatabase,
        keys: List<MessageKeys>,
        pendingIds: PendingIdDao = database.pendingIdDao(),
        revisions: EditRevisionDao = database.editRevisionDao(),
        receipts: EphemeralReceiptDao = database.ephemeralReceiptDao(),
    ) {
        if (keys.isEmpty()) return
        val ids = keys.flatMap { listOfNotNull(it.id, it.serverId) }.distinct()
        ids.chunked(CHUNK).forEach { chunk ->
            pendingIds.deleteForMessages(chunk)
            revisions.deleteForMessages(chunk)
            receipts.deleteAll(chunk)
        }
        DedicatedTranslationRows.drop(database, ids)
    }

    private const val CHUNK = 400
}

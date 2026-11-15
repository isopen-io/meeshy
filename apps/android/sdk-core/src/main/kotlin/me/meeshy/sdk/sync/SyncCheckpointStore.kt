package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.entity.SyncMetaEntity
import me.meeshy.sdk.model.sync.SyncCheckpoint

/** Le compte dont la session est active, ou `null` quand il n'est pas connu. */
fun interface SyncAccountProvider {
    fun activeAccountId(): String?

    companion object {
        val None: SyncAccountProvider = SyncAccountProvider { null }
    }
}

/**
 * Le point de reprise de chaque compte (`lastSync`, `lastCleanup`, `lastFullReconcile`), rangé dans
 * `sync_meta` — une ligne par horloge et par compte, sans table nouvelle : le schéma Room ne bouge
 * pas. Un compte quitté retrouve ses trois horloges à son retour.
 */
@Singleton
class SyncCheckpointStore @Inject constructor(private val syncMetaDao: SyncMetaDao) {

    suspend fun read(account: String): SyncCheckpoint = SyncCheckpoint(
        lastSync = syncMetaDao.lastSyncedAt(key(account, LAST_SYNC)),
        lastCleanup = syncMetaDao.lastSyncedAt(key(account, LAST_CLEANUP)),
        lastFullReconcile = syncMetaDao.lastSyncedAt(key(account, LAST_FULL_RECONCILE)),
    )

    suspend fun write(account: String, checkpoint: SyncCheckpoint) {
        write(account, LAST_SYNC, checkpoint.lastSync)
        write(account, LAST_CLEANUP, checkpoint.lastCleanup)
        write(account, LAST_FULL_RECONCILE, checkpoint.lastFullReconcile)
    }

    private suspend fun write(account: String, clock: String, value: Long?) {
        if (value != null) syncMetaDao.upsert(SyncMetaEntity(key(account, clock), value))
    }

    private fun key(account: String, clock: String) = "sync-checkpoint:$account:$clock"

    private companion object {
        const val LAST_SYNC = "lastSync"
        const val LAST_CLEANUP = "lastCleanup"
        const val LAST_FULL_RECONCILE = "lastFullReconcile"
    }
}

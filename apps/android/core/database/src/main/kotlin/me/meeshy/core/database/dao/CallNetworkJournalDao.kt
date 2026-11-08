package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.CallNetworkJournalEntity

@Dao
public abstract class CallNetworkJournalDao {

    @Query("SELECT * FROM call_network_journal WHERE account = :account AND callId = :callId")
    public abstract fun observe(account: String, callId: String): Flow<CallNetworkJournalEntity?>

    @Query("SELECT * FROM call_network_journal WHERE account = :account AND callId = :callId")
    public abstract suspend fun get(account: String, callId: String): CallNetworkJournalEntity?

    @Query("SELECT callId FROM call_network_journal WHERE account = :account ORDER BY startedAt DESC, callId")
    public abstract suspend fun callIds(account: String): List<String>

    @Upsert
    public abstract suspend fun upsert(row: CallNetworkJournalEntity)

    @Query("DELETE FROM call_network_journal WHERE account = :account AND callId = :callId")
    public abstract suspend fun delete(account: String, callId: String)

    /** Déconnexion, retrait ou changement de compte : les journaux d'un compte partent avec lui. */
    @Query("DELETE FROM call_network_journal WHERE account = :account")
    public abstract suspend fun deleteAccount(account: String)

    @Query("DELETE FROM call_network_journal")
    public abstract suspend fun clear()

    @Query("DELETE FROM call_network_journal WHERE account = :account AND startedAt < :cutoff")
    protected abstract suspend fun deleteOlderThan(account: String, cutoff: Long)

    @Query(
        "DELETE FROM call_network_journal WHERE account = :account AND callId IN (" +
            "SELECT callId FROM call_network_journal WHERE account = :account " +
            "ORDER BY startedAt DESC, callId LIMIT -1 OFFSET :keep)",
    )
    protected abstract suspend fun deleteBeyond(account: String, keep: Int)

    /** Rétention d'un compte : 30 jours et 200 appels, les plus récents gardés. */
    @Transaction
    public open suspend fun prune(account: String, now: Long) {
        deleteOlderThan(account, now - RETENTION_MILLIS)
        deleteBeyond(account, MAX_CALLS)
    }

    @Transaction
    public open suspend fun saveAndPrune(row: CallNetworkJournalEntity, now: Long) {
        upsert(row)
        prune(row.account, now)
    }

    public companion object {
        public const val RETENTION_MILLIS: Long = 30L * 24 * 60 * 60 * 1000
        public const val MAX_CALLS: Int = 200
    }
}

package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.PlaintextErasureEntity

/** La file durable des clairs E2EE à retirer du coffre (#14655). */
@Dao
public interface PlaintextErasureDao {

    /** Un message déjà inscrit garde sa première inscription, plus riche (son `cid_` et son auteur). */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    public suspend fun recordMessages(rows: List<PlaintextErasureEntity>)

    /** Une conversation réinscrite repousse sa borne : les clairs reçus depuis partent aussi. */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    public suspend fun recordConversation(row: PlaintextErasureEntity)

    @Query(
        "SELECT * FROM e2ee_plaintext_erasures WHERE acknowledgedAt IS NULL " +
            "AND (account = '' OR account = :account) ORDER BY recordedAt, itemId LIMIT :limit",
    )
    public suspend fun pending(account: String, limit: Int): List<PlaintextErasureEntity>

    @Query("SELECT COUNT(*) FROM e2ee_plaintext_erasures WHERE acknowledgedAt IS NULL")
    public fun observePendingCount(): Flow<Int>

    @Query(
        "UPDATE e2ee_plaintext_erasures SET acknowledgedAt = :now WHERE account = :account AND kind = :kind " +
            "AND itemId = :itemId AND recordedAt = :recordedAt AND acknowledgedAt IS NULL",
    )
    public suspend fun acknowledge(account: String, kind: String, itemId: String, recordedAt: Long, now: Long)

    @Query("DELETE FROM e2ee_plaintext_erasures WHERE acknowledgedAt IS NOT NULL AND acknowledgedAt < :cutoff")
    public suspend fun forgetAcknowledgedBefore(cutoff: Long)

    /** Les inscriptions, acquittées comprises, qui nomment [itemIds] : une enveloppe ouverte après coup les relit. */
    @Query(
        "SELECT * FROM e2ee_plaintext_erasures WHERE kind = :kind AND itemId IN (:itemIds) " +
            "AND (account = '' OR account = :account)",
    )
    public suspend fun recorded(account: String, kind: String, itemIds: List<String>): List<PlaintextErasureEntity>

    @Query("SELECT * FROM e2ee_plaintext_erasures")
    public suspend fun all(): List<PlaintextErasureEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    public suspend fun restore(rows: List<PlaintextErasureEntity>)
}

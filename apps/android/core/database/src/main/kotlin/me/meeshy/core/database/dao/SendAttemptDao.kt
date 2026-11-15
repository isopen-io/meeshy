package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.SendAttemptEntity

@Dao
public interface SendAttemptDao {

    /**
     * Ajoute une tentative en une seule instruction : son numéro est le plus grand déjà écrit pour ce message, plus un.
     * L'atomicité de l'instruction garde le compteur monotone sans transaction.
     */
    @Query(
        "INSERT INTO send_attempts (localId, attemptNumber, transport, startedAt, finishedAt, outcome, errorMessage) " +
            "SELECT :localId, COALESCE(MAX(attemptNumber), 0) + 1, :transport, :startedAt, :finishedAt, :outcome, :errorMessage " +
            "FROM send_attempts WHERE localId = :localId",
    )
    public suspend fun append(
        localId: String,
        transport: String,
        startedAt: Long,
        finishedAt: Long?,
        outcome: String,
        errorMessage: String?,
    )

    @Query("SELECT * FROM send_attempts WHERE localId = :localId ORDER BY attemptNumber")
    public fun observe(localId: String): Flow<List<SendAttemptEntity>>

    @Query("SELECT * FROM send_attempts WHERE localId = :localId ORDER BY attemptNumber")
    public suspend fun forMessage(localId: String): List<SendAttemptEntity>

    @Query("DELETE FROM send_attempts WHERE localId IN (:localIds)")
    public suspend fun deleteForMessages(localIds: List<String>)
}

package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.CallTranscriptEntity

@Dao
public abstract class CallTranscriptDao {

    @Query("SELECT * FROM call_transcript WHERE callId = :callId ORDER BY capturedAt, wireId")
    public abstract fun observe(callId: String): Flow<List<CallTranscriptEntity>>

    @Query("SELECT * FROM call_transcript WHERE callId = :callId ORDER BY capturedAt, wireId")
    public abstract suspend fun segments(callId: String): List<CallTranscriptEntity>

    @Query("SELECT callStartedAt FROM call_transcript WHERE callId = :callId ORDER BY callStartedAt LIMIT 1")
    protected abstract suspend fun earliestStart(callId: String): Long?

    @Upsert
    protected abstract suspend fun upsertAll(rows: List<CallTranscriptEntity>)

    @Query("DELETE FROM call_transcript WHERE callId = :callId")
    public abstract suspend fun invalidate(callId: String)

    @Query("DELETE FROM call_transcript")
    public abstract suspend fun clear()

    /**
     * Fusionne [rows] avec ce que l'appel a déjà : idempotent par (callId, wireId), les segments d'avant une reprise sont
     * gardés, et le début d'appel d'origine l'emporte (comme `CallTranscriptStore.saveMerging` iOS).
     */
    @Transaction
    public open suspend fun saveMerging(rows: List<CallTranscriptEntity>) {
        if (rows.isEmpty()) return
        val originalStarts = rows.map { it.callId }.distinct().associateWith { earliestStart(it) }
        upsertAll(rows.map { row -> originalStarts[row.callId]?.let { row.copy(callStartedAt = it) } ?: row })
    }
}

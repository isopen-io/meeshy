package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import me.meeshy.core.database.entity.MediaBlobEntity

/**
 * Durable store for the raw bytes of queued media uploads (ARCHITECTURE.md §5).
 *
 * Keyed by the owning `UPLOAD_MEDIA` outbox row's `cmid`. A blob is written when
 * a media upload is enqueued and deleted once the upload has been delivered (or
 * its chain abandoned), so the table only ever holds in-flight payloads.
 */
@Dao
public interface MediaBlobDao {

    @Upsert
    public suspend fun upsert(blob: MediaBlobEntity)

    @Query("SELECT * FROM media_blob WHERE cmid = :cmid")
    public suspend fun find(cmid: String): MediaBlobEntity?

    @Query("SELECT EXISTS(SELECT 1 FROM media_blob WHERE cmid = :cmid)")
    public suspend fun exists(cmid: String): Boolean

    @Query("DELETE FROM media_blob WHERE cmid = :cmid")
    public suspend fun delete(cmid: String)

    @Query("DELETE FROM media_blob")
    public suspend fun clear()
}

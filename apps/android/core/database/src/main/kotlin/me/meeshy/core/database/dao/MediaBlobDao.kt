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

    /** Every held `cmid` — the boot sweep keeps the sealed files these name (#13555). */
    @Query("SELECT cmid FROM media_blob")
    public suspend fun cmids(): List<String>

    /** The `cmid`s of rows written before [before] — the sweep never touches a write of the running process. */
    @Query("SELECT cmid FROM media_blob WHERE createdAt < :before")
    public suspend fun cmidsOlderThan(before: Long): List<String>

    /** The row WITHOUT its `bytes` column: reading a legacy multi-megabyte BLOB whole overflows the cursor window. */
    @Query("SELECT cmid, fileName, mimeType, createdAt FROM media_blob WHERE cmid = :cmid")
    public suspend fun meta(cmid: String): MediaBlobMeta?

    /** Rows still holding octets in the BLOB column (written before the sealed files, #13551). */
    @Query("SELECT cmid FROM media_blob WHERE length(bytes) > 0")
    public suspend fun legacyCmids(): List<String>

    @Query("SELECT length(bytes) FROM media_blob WHERE cmid = :cmid")
    public suspend fun legacyLength(cmid: String): Long?

    /** A slice of the legacy BLOB (1-based [from], as SQLite `substr`) — read piece by piece, never whole. */
    @Query("SELECT substr(bytes, :from, :count) FROM media_blob WHERE cmid = :cmid")
    public suspend fun legacySlice(cmid: String, from: Long, count: Long): ByteArray?

    /** Empties the BLOB once its octets live in a sealed file. */
    @Query("UPDATE media_blob SET bytes = zeroblob(0) WHERE cmid = :cmid")
    public suspend fun clearBytes(cmid: String)

    @Query("DELETE FROM media_blob WHERE cmid = :cmid")
    public suspend fun delete(cmid: String)

    @Query("DELETE FROM media_blob")
    public suspend fun clear()
}

/** A `media_blob` row without its octets. */
public class MediaBlobMeta(
    public val cmid: String,
    public val fileName: String,
    public val mimeType: String,
    public val createdAt: Long,
)

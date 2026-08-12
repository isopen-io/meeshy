package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Durable bytes of a media file awaiting upload (ARCHITECTURE.md §5; ADR-006).
 *
 * The outbox carries a `String` payload, so the raw bytes of a queued
 * `UPLOAD_MEDIA` row live here instead — keyed by the upload row's `cmid`. This
 * is the producer half of the durable upload→publish chain: a media story can be
 * queued **fully offline**, its bytes surviving process death, and uploaded later
 * when connectivity returns. Surpasses iOS, which uploads synchronously and
 * cannot queue a media attachment while offline.
 *
 * Plain `class` (not a `data` class) because [bytes] is a `ByteArray` — value
 * equality over arrays is a footgun and the row is never compared by value (it is
 * looked up by [cmid]). Mirrors the same decision on
 * `me.meeshy.sdk.media.MediaUploadItem`.
 *
 * @property cmid the owning `UPLOAD_MEDIA` outbox row's client mutation id.
 * @property bytes the raw file contents to upload.
 * @property fileName advertised filename for the multipart part.
 * @property mimeType advertised content type for the multipart part.
 * @property createdAt enqueue time, for oldest-first ordering / housekeeping.
 */
@Entity(tableName = "media_blob")
public class MediaBlobEntity(
    @PrimaryKey public val cmid: String,
    public val bytes: ByteArray,
    public val fileName: String,
    public val mimeType: String,
    public val createdAt: Long,
)

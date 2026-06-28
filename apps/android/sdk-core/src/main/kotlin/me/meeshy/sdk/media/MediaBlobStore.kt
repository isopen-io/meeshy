package me.meeshy.sdk.media

import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.entity.MediaBlobEntity
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Durable store for the raw bytes of queued media uploads (ARCHITECTURE.md §5;
 * ADR-006) — the producer half of the durable upload→publish chain.
 *
 * The shared outbox carries a `String` payload, so an `UPLOAD_MEDIA` row keeps
 * its bytes here instead, keyed by that row's `cmid`. The future `MEDIA`-lane
 * sender reads the blob back, uploads it, and [remove]s it once delivered — so a
 * media attachment queued **fully offline** survives process death and uploads
 * when connectivity returns.
 *
 * A stateless building block: it persists and returns exactly the
 * [MediaUploadItem] the uploader consumes (single source of truth — no second
 * bytes shape). The "when to enqueue / when to upload" decisions belong to the
 * product layer, not here.
 */
@Singleton
class MediaBlobStore @Inject constructor(
    private val mediaBlobDao: MediaBlobDao,
) {
    /** Persists [item]'s bytes under [cmid], replacing any previous blob for it. */
    suspend fun put(cmid: String, item: MediaUploadItem) {
        mediaBlobDao.upsert(
            MediaBlobEntity(
                cmid = cmid,
                bytes = item.bytes,
                fileName = item.fileName,
                mimeType = item.mimeType,
                createdAt = now(),
            ),
        )
    }

    /** The stored upload for [cmid], or `null` when no blob is held for it. */
    suspend fun get(cmid: String): MediaUploadItem? =
        mediaBlobDao.find(cmid)?.let { row ->
            MediaUploadItem(bytes = row.bytes, fileName = row.fileName, mimeType = row.mimeType)
        }

    /** Drops the blob for [cmid] (delivered, or its chain abandoned). No-op if absent. */
    suspend fun remove(cmid: String) {
        mediaBlobDao.delete(cmid)
    }

    private fun now(): Long = System.currentTimeMillis()
}

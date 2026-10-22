package me.meeshy.app.chat

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.flowOf

/**
 * One photo or video of the device library, as the recent-media grid shows it — the
 * Android counterpart of the `PHAsset` the iOS strip lists. [id] is stable across
 * refreshes and unique across images AND videos (their MediaStore row ids collide).
 */
internal data class RecentMediaItem(
    val id: String,
    val uri: Uri,
    val isVideo: Boolean,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val dateAdded: Long,
)

/**
 * Head of the device library, newest first, observed live. Mirrors iOS
 * `RecentMediaStripModel.fetch` + `PHPhotoLibraryChangeObserver`: a tiny head fetch
 * (<= [HEAD_SAMPLE_COUNT]) re-run on every library change. Under Android 14 partial
 * access MediaStore only exposes what the user granted, so the same query serves
 * both full and limited access.
 */
internal object RecentMediaSource {
    const val HEAD_SAMPLE_COUNT = 40
    const val COLUMN_COUNT = 4
    private const val CHANGE_DEBOUNCE_MS = 300L

    private val IMAGES: Uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    private val VIDEOS: Uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI

    fun load(resolver: ContentResolver, limit: Int = HEAD_SAMPLE_COUNT): List<RecentMediaItem> =
        (query(resolver, IMAGES, isVideo = false, limit) + query(resolver, VIDEOS, isVideo = true, limit))
            .sortedByDescending { it.dateAdded }
            .take(limit)

    fun observe(context: Context, limit: Int = HEAD_SAMPLE_COUNT): Flow<List<RecentMediaItem>> {
        val resolver = context.applicationContext.contentResolver
        val changes = callbackFlow {
            val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) {
                    trySend(Unit)
                }
            }
            resolver.registerContentObserver(IMAGES, true, observer)
            resolver.registerContentObserver(VIDEOS, true, observer)
            awaitClose { resolver.unregisterContentObserver(observer) }
        }.debounce(CHANGE_DEBOUNCE_MS)
        return merge(flowOf(Unit), changes)
            .conflate()
            .map { runCatching { load(resolver, limit) }.getOrDefault(emptyList()) }
            .flowOn(Dispatchers.IO)
    }

    private fun query(resolver: ContentResolver, base: Uri, isVideo: Boolean, limit: Int): List<RecentMediaItem> {
        val projection = if (isVideo) {
            arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DATE_ADDED,
                MediaStore.MediaColumns.WIDTH,
                MediaStore.MediaColumns.HEIGHT,
                MediaStore.Video.VideoColumns.DURATION,
            )
        } else {
            arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DATE_ADDED,
                MediaStore.MediaColumns.WIDTH,
                MediaStore.MediaColumns.HEIGHT,
            )
        }
        val args = Bundle().apply {
            putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.MediaColumns.DATE_ADDED))
            putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
            putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
        }
        val prefix = if (isVideo) "v" else "i"
        return runCatching {
            resolver.query(base, projection, args, null)?.use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val dateIdx = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED)
                val widthIdx = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.WIDTH)
                val heightIdx = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.HEIGHT)
                val durationIdx = if (isVideo) cursor.getColumnIndexOrThrow(MediaStore.Video.VideoColumns.DURATION) else -1
                buildList {
                    while (cursor.moveToNext()) {
                        val rowId = cursor.getLong(idIdx)
                        add(
                            RecentMediaItem(
                                id = "$prefix:$rowId",
                                uri = ContentUris.withAppendedId(base, rowId),
                                isVideo = isVideo,
                                durationMs = if (durationIdx >= 0) cursor.getLong(durationIdx) else 0L,
                                width = cursor.getInt(widthIdx),
                                height = cursor.getInt(heightIdx),
                                dateAdded = cursor.getLong(dateIdx),
                            ),
                        )
                    }
                }
            }
        }.getOrNull().orEmpty()
    }
}

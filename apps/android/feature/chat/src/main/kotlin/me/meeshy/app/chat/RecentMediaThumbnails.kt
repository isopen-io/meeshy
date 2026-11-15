package me.meeshy.app.chat

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.util.LruCache
import android.util.Size
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.composer.RecentMediaCachingWindow

/**
 * Square thumbnails of the recent-media cells, pre-loaded around the visible cell —
 * the Android counterpart of iOS `PHCachingImageManager` driven by
 * [RecentMediaCachingWindow]: what is about to scroll in is prepared ahead, what left
 * the window is released (its pending load cancelled). Main-thread confined except
 * for the loads themselves, which run on [Dispatchers.IO].
 */
internal class RecentMediaThumbnails(
    context: Context,
    private val scope: CoroutineScope,
    private val columns: Int = RecentMediaSource.COLUMN_COUNT,
) {
    private val resolver: ContentResolver = context.applicationContext.contentResolver
    private val cache = object : LruCache<String, Bitmap>(CACHE_BYTES) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    private val inFlight = HashMap<String, Job>()
    private var windowIds: List<String> = emptyList()
    private var windowPixelSide = 0

    fun peek(item: RecentMediaItem, pixelSide: Int): Bitmap? = cache.get(key(item, pixelSide))

    suspend fun load(item: RecentMediaItem, pixelSide: Int): Bitmap? {
        peek(item, pixelSide)?.let { return it }
        val bitmap = withContext(Dispatchers.IO) { decode(item, pixelSide) } ?: return null
        cache.put(key(item, pixelSide), bitmap)
        return bitmap
    }

    fun cacheAround(assetId: String, items: List<RecentMediaItem>, pixelSide: Int) {
        if (pixelSide <= 0) return
        if (pixelSide != windowPixelSide) {
            cancelAll()
            windowPixelSide = pixelSide
        }
        val window = RecentMediaCachingWindow.ids(assetId, items.map { it.id }, columns)
        val delta = RecentMediaCachingWindow.delta(windowIds, window)
        windowIds = window
        val byId = items.associateBy { it.id }
        delta.stop.forEach { inFlight.remove(it)?.cancel() }
        delta.start.mapNotNull { byId[it] }.forEach { item ->
            if (peek(item, pixelSide) != null) return@forEach
            inFlight[item.id] = scope.launch { load(item, pixelSide) }
        }
    }

    fun clear() {
        cancelAll()
        cache.evictAll()
    }

    private fun cancelAll() {
        inFlight.values.forEach { it.cancel() }
        inFlight.clear()
        windowIds = emptyList()
    }

    private fun decode(item: RecentMediaItem, pixelSide: Int): Bitmap? = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            resolver.loadThumbnail(item.uri, Size(pixelSide, pixelSide), null)
        } else {
            legacyThumbnail(item)
        }
    }.getOrNull()

    @Suppress("DEPRECATION")
    private fun legacyThumbnail(item: RecentMediaItem): Bitmap? {
        val rowId = item.id.substringAfter(':').toLongOrNull() ?: return null
        return if (item.isVideo) {
            MediaStore.Video.Thumbnails.getThumbnail(resolver, rowId, MediaStore.Video.Thumbnails.MINI_KIND, null)
        } else {
            MediaStore.Images.Thumbnails.getThumbnail(resolver, rowId, MediaStore.Images.Thumbnails.MINI_KIND, null)
        }
    }

    private fun key(item: RecentMediaItem, pixelSide: Int) = "${item.id}@$pixelSide"

    private companion object {
        const val CACHE_BYTES = 24 * 1024 * 1024
    }
}

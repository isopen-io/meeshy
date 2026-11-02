package me.meeshy.app.settings

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheReport
import me.meeshy.ui.component.media.MeeshyMediaCache
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads and clears the app's on-disk media caches. Product-side orchestration (it knows the
 * concrete Android cache-directory layout) — kept out of the SDK per the purity rule; the pure,
 * directory-agnostic size/delete arithmetic lives in [MediaCacheScanner].
 */
interface MediaCacheStore {
    /** Current per-category disk usage. */
    suspend fun report(): MediaCacheReport

    /** Delete the cached files of the given categories (no-op for categories with no directory). */
    suspend fun clear(categories: Set<MediaCacheCategory>)
}

/**
 * Disk-backed [MediaCacheStore]. AUDIO and VIDEO are the two Media3 `SimpleCache`s of
 * [MeeshyMediaCache] (`media-cache/Audio/spans`, `media-cache/Video/spans`): an open SimpleCache
 * owns its folder, so both size and clear go through its API, never through the files beneath it.
 * IMAGES is Coil's `image_cache` folder and THUMBNAILS the canonical [MediaCacheDirs] folder,
 * measured and cleared by [MediaCacheScanner]; a not-yet-created folder is a graceful no-op.
 */
@Singleton
class AndroidMediaCacheStore @Inject constructor(
    @ApplicationContext private val context: Context,
) : MediaCacheStore {

    private val cacheRoot: File = context.cacheDir

    private val directories: Map<MediaCacheCategory, File> = mapOf(
        MediaCacheCategory.IMAGES to File(cacheRoot, "image_cache"),
        MediaCacheCategory.THUMBNAILS to MediaCacheDirs(cacheRoot, cacheRoot).dirFor(MediaCacheCategory.THUMBNAILS),
    )

    private val media3Categories: Set<MediaCacheCategory> = setOf(MediaCacheCategory.AUDIO, MediaCacheCategory.VIDEO)

    private val media3: MeeshyMediaCache get() = MeeshyMediaCache.get(context)

    override suspend fun report(): MediaCacheReport = withContext(Dispatchers.IO) {
        MediaCacheReport.of(
            directories.mapValues { (_, dir) -> MediaCacheScanner.sizeOf(dir) } +
                media3Categories.associateWith { media3.diskBytes(it) },
        )
    }

    override suspend fun clear(categories: Set<MediaCacheCategory>): Unit = withContext(Dispatchers.IO) {
        categories.forEach { category ->
            if (category in media3Categories) {
                media3.clear(category)
            } else {
                directories[category]?.let(MediaCacheScanner::clear)
            }
        }
    }
}

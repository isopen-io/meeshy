package me.meeshy.app.settings

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.mediacache.MediaCacheReport
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
 * File-system backed [MediaCacheStore]. Maps each [MediaCacheCategory] to a directory under the
 * app's [Context.getCacheDir]: `images` targets Coil's default `image_cache` folder (populated
 * today), the others target dedicated `media` sub-folders the media pipeline will fill — scanning or
 * clearing a not-yet-created folder is a graceful no-op, so the feature is honest today and
 * forward-compatible. This is coverage-exempt I/O glue; the tested logic is [MediaCacheScanner].
 */
@Singleton
class AndroidMediaCacheStore @Inject constructor(
    @ApplicationContext context: Context,
) : MediaCacheStore {

    private val cacheRoot: File = context.cacheDir

    private val directories: Map<MediaCacheCategory, File> = mapOf(
        MediaCacheCategory.IMAGES to File(cacheRoot, "image_cache"),
        MediaCacheCategory.AUDIO to File(cacheRoot, "media/audio"),
        MediaCacheCategory.VIDEO to File(cacheRoot, "media/video"),
        MediaCacheCategory.THUMBNAILS to File(cacheRoot, "media/thumbnails"),
    )

    override suspend fun report(): MediaCacheReport = withContext(Dispatchers.IO) {
        MediaCacheReport.of(
            directories.mapValues { (_, dir) -> MediaCacheScanner.sizeOf(dir) },
        )
    }

    override suspend fun clear(categories: Set<MediaCacheCategory>): Unit = withContext(Dispatchers.IO) {
        categories.forEach { category ->
            directories[category]?.let(MediaCacheScanner::clear)
        }
    }
}

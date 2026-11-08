package me.meeshy.ui.component.viewer

import android.content.Context
import me.meeshy.sdk.media.GalleryMediaSaver

/**
 * Writes a viewed media into the device gallery via MediaStore — through the shared
 * deduplicating [GalleryMediaSaver] (#14642): a media already in the gallery is never
 * written twice, and finding it there is a success. On releases older than Android 10
 * [isSupported] is `false` and the caller hides the affordance rather than triggering a
 * legacy `WRITE_EXTERNAL_STORAGE` prompt.
 */
public object GalleryImageSaver {

    public val isSupported: Boolean get() = GalleryMediaSaver.isSupported

    public suspend fun save(
        context: Context,
        url: String,
        mimeHint: String? = null,
    ): Result<Unit> {
        val outcome = GalleryMediaSaver(context).saveRemote(url = url, mimeHint = mimeHint)
        return if (outcome.isInGallery) Result.success(Unit) else Result.failure(IllegalStateException("Gallery save failed for $url"))
    }
}

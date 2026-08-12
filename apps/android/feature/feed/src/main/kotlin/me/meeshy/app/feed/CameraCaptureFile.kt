package me.meeshy.app.feed

/**
 * Names the destination file for a Feed-composer camera-photo or camera-video capture. Unlike
 * the gallery pickers ([FeedMediaPicker]), which hand back an already-existing content
 * [android.net.Uri], both [androidx.activity.result.contract.ActivityResultContracts.TakePicture]
 * (photo) and [androidx.activity.result.contract.ActivityResultContracts.CaptureVideo] (video)
 * write their result into a `File`/`Uri` the CALLER must create up front — so a name is needed
 * before the system camera activity even launches.
 *
 * Pure builder (mirrors the split `me.meeshy.sdk.model.export.DataExportFileBuilder` uses): the
 * instant is an explicit parameter, never read internally, so a fixed timestamp always yields the
 * identical name. The actual `File`/`FileProvider.getUriForFile` creation stays coverage-exempt
 * I/O glue in [FeedComposerSheet], the same precedent as its own `ContentResolver.
 * readMediaUploadItem`. Photo and video use distinct prefixes/extensions so the two never collide
 * for the same instant even though both share the `captures/` cache directory.
 */
object CameraCaptureFile {
    private const val PHOTO_PREFIX = "capture_"
    private const val PHOTO_EXTENSION = ".jpg"
    private const val VIDEO_PREFIX = "video_"
    private const val VIDEO_EXTENSION = ".mp4"

    /** e.g. `next(1700000000000L) == "capture_1700000000000.jpg"`. */
    fun next(nowMillis: Long): String = "$PHOTO_PREFIX$nowMillis$PHOTO_EXTENSION"

    /** e.g. `nextVideo(1700000000000L) == "video_1700000000000.mp4"`. */
    fun nextVideo(nowMillis: Long): String = "$VIDEO_PREFIX$nowMillis$VIDEO_EXTENSION"
}

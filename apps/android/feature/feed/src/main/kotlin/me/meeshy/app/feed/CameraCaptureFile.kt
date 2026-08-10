package me.meeshy.app.feed

/**
 * Names the destination file for a Feed-composer camera-photo capture. Unlike the gallery
 * pickers ([FeedMediaPicker]), which hand back an already-existing content [android.net.Uri],
 * [androidx.activity.result.contract.ActivityResultContracts.TakePicture] writes its result into
 * a `File`/`Uri` the CALLER must create up front — so a name is needed before the system camera
 * activity even launches.
 *
 * Pure builder (mirrors the split `me.meeshy.sdk.model.export.DataExportFileBuilder` uses): the
 * instant is an explicit parameter, never read internally, so a fixed timestamp always yields the
 * identical name. The actual `File`/`FileProvider.getUriForFile` creation stays coverage-exempt
 * I/O glue in [FeedComposerSheet], the same precedent as its own `ContentResolver.
 * readMediaUploadItem`.
 */
object CameraCaptureFile {
    private const val PREFIX = "capture_"
    private const val EXTENSION = ".jpg"

    /** e.g. `next(1700000000000L) == "capture_1700000000000.jpg"`. */
    fun next(nowMillis: Long): String = "$PREFIX$nowMillis$EXTENSION"
}

package me.meeshy.app.feed

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File
import me.meeshy.sdk.media.MediaUploadItem

/**
 * Builds the `content://` destination [Uri] a system capture activity ([ActivityResultContracts.
 * TakePicture]/[ActivityResultContracts.CaptureVideo]) will write its result into, under
 * `context.cacheDir/captures` via the app's [FileProvider] authority. Shared by both the photo
 * and video capture launchers — [fileName] (from [CameraCaptureFile.next]/[CameraCaptureFile.
 * nextVideo]) is the only thing that differs between them.
 */
internal fun Context.createCaptureUri(fileName: String): Uri {
    val capturesDir = File(cacheDir, "captures").apply { mkdirs() }
    val file = File(capturesDir, fileName)
    return FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
}

/**
 * Grants every activity that can resolve [action] (`ACTION_IMAGE_CAPTURE`/`ACTION_VIDEO_CAPTURE`)
 * write+read permission on [uri]. Both [ActivityResultContracts.TakePicture] and
 * [ActivityResultContracts.CaptureVideo] build their capture `Intent` with a plain `EXTRA_OUTPUT`
 * and never set `FLAG_GRANT_WRITE_URI_PERMISSION` themselves (confirmed by reading both
 * contracts' decompiled bytecode — identical shape, same gap) — so an implicitly-resolved camera
 * app has no permission to write into our [FileProvider] Uri unless granted here first (confirmed
 * on-device for the photo case: without this, the stock AOSP camera silently fails to save and
 * the launcher resolves `success = false`). Canonical Android pattern: grant every activity that
 * CAN resolve the capture intent, since the system picks one of them at launch time and the
 * caller can't know which in advance.
 */
internal fun Context.grantCaptureWritePermission(action: String, uri: Uri) {
    packageManager
        .queryIntentActivities(Intent(action), PackageManager.MATCH_DEFAULT_ONLY)
        .forEach { resolveInfo ->
            grantUriPermission(
                resolveInfo.activityInfo.packageName,
                uri,
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
        }
}

/**
 * Reads the picked content into a [MediaUploadItem] (bytes + advertised
 * filename + MIME). Returns null when the stream can't be opened. Pure-IO
 * glue — the filename/MIME defaulting lives in `MediaUpload`, so this stays a
 * thin reader. Mirror of `StoryComposerScreen`'s own private extension
 * (duplicated per this codebase's existing convention — see also
 * `RegistrationScreen`/`ProfileScreen`).
 */
internal fun ContentResolver.readMediaUploadItem(uri: Uri): MediaUploadItem? {
    val bytes = runCatching { openInputStream(uri)?.use { it.readBytes() } }.getOrNull() ?: return null
    val mimeType = getType(uri).orEmpty()
    val fileName = displayName(uri).orEmpty()
    return MediaUploadItem(bytes = bytes, fileName = fileName, mimeType = mimeType)
}

private fun ContentResolver.displayName(uri: Uri): String? =
    runCatching {
        query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
        }
    }.getOrNull()

/**
 * The camera-photo and camera-video tiles: both [ActivityResultContracts.TakePicture] and
 * [ActivityResultContracts.CaptureVideo] write into a Uri WE provide, so the destination is created
 * up front and held only long enough to resolve the callback — cleared either way so a second tap
 * always starts fresh. A cancelled or failed capture deletes its (possibly empty) destination.
 */
internal class FeedCameraCapture(private val context: Context) {
    internal var photoUri: Uri? = null
    internal var videoUri: Uri? = null
    internal var launchPhoto: (Uri) -> Unit = {}
    internal var launchVideo: (Uri) -> Unit = {}

    fun photo() {
        val uri = destination(CameraCaptureFile.next(System.currentTimeMillis()), MediaStore.ACTION_IMAGE_CAPTURE)
        photoUri = uri
        launchPhoto(uri)
    }

    fun video() {
        val uri = destination(CameraCaptureFile.nextVideo(System.currentTimeMillis()), MediaStore.ACTION_VIDEO_CAPTURE)
        videoUri = uri
        launchVideo(uri)
    }

    /** The captured Uri when [success], or `null` after the empty destination is deleted. */
    internal fun resolve(uri: Uri?, success: Boolean): Uri? {
        if (success && uri != null) return uri
        uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
        return null
    }

    private fun destination(fileName: String, action: String): Uri =
        context.createCaptureUri(fileName).also { context.grantCaptureWritePermission(action, it) }
}

@Composable
internal fun rememberFeedCameraCapture(onPhoto: (Uri) -> Unit, onVideo: (Uri) -> Unit): FeedCameraCapture {
    val context = LocalContext.current
    val photo by rememberUpdatedState(onPhoto)
    val video by rememberUpdatedState(onVideo)
    val camera = remember { FeedCameraCapture(context) }
    val takePicture = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        val uri = camera.photoUri
        camera.photoUri = null
        camera.resolve(uri, success)?.let(photo)
    }
    val captureVideo = rememberLauncherForActivityResult(ActivityResultContracts.CaptureVideo()) { success ->
        val uri = camera.videoUri
        camera.videoUri = null
        camera.resolve(uri, success)?.let(video)
    }
    camera.launchPhoto = { takePicture.launch(it) }
    camera.launchVideo = { captureVideo.launch(it) }
    return camera
}

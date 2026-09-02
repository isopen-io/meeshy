package me.meeshy.app.chat

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.launch

/**
 * Filenames for a composer-drawer camera capture (issue #3738) — photo or video.
 * Pure builder mirroring `me.meeshy.app.feed.CameraCaptureFile` (the Feed
 * composer's own camera tile, shipped earlier): the instant is an explicit
 * parameter, never read internally, so a fixed instant always yields the
 * identical name. `feature/chat` cannot depend on `feature/feed` (sibling
 * feature modules, no cross-feature Gradle edge), so this is a deliberate small
 * duplication of naming glue rather than a shared type — this codebase's own
 * established precedent for platform-adjacent glue (see `FeedComposerSheet`'s
 * own doc-comment on `readMediaUploadItem`, duplicated from the story composer
 * for the identical reason). The `chat_` prefix keeps the two composers' capture
 * files from colliding inside the SAME `cacheDir/captures/` FileProvider path
 * (declared once, app-wide, in `app/src/main/res/xml/file_paths.xml` — reused
 * as-is, no manifest change needed for this lot).
 */
object ChatCameraCaptureFile {
    private const val PHOTO_PREFIX = "chat_capture_"
    private const val PHOTO_EXTENSION = ".jpg"
    private const val VIDEO_PREFIX = "chat_video_"
    private const val VIDEO_EXTENSION = ".mp4"

    /** e.g. `next(1700000000000L) == "chat_capture_1700000000000.jpg"`. */
    fun next(nowMillis: Long): String = "$PHOTO_PREFIX$nowMillis$PHOTO_EXTENSION"

    /** e.g. `nextVideo(1700000000000L) == "chat_video_1700000000000.mp4"`. */
    fun nextVideo(nowMillis: Long): String = "$VIDEO_PREFIX$nowMillis$VIDEO_EXTENSION"
}

/** The two capture launchers the composer's Camera tile chooser offers. */
class ChatCameraCaptureLaunchers internal constructor(
    private val launchPhotoImpl: () -> Unit,
    private val launchVideoImpl: () -> Unit,
) {
    fun launchPhoto() = launchPhotoImpl()
    fun launchVideo() = launchVideoImpl()
}

/**
 * Wires the two system capture intents — `ACTION_IMAGE_CAPTURE` and
 * `ACTION_VIDEO_CAPTURE` — behind [ActivityResultContracts.TakePicture] /
 * [ActivityResultContracts.CaptureVideo], the exact pattern
 * `me.meeshy.app.feed.FeedComposerSheet`'s own two camera tiles already proved:
 * no CameraX dependency (absent from the version catalog), no `CAMERA` runtime
 * permission to request here — the system camera app that resolves the intent
 * owns that permission, not this composer.
 *
 * A fresh [ChatCameraCaptureFile]-named destination is created under the app's
 * `FileProvider` before each launch; write permission is granted directly on
 * the capture [Intent] via [GrantingTakePicture]/[GrantingCaptureVideo] (a
 * plain `EXTRA_OUTPUT` grants nothing on its own) rather than through
 * `PackageManager.queryIntentActivities`, which package-visibility (API 30+,
 * this app's `targetSdk`) can hide without a `<queries>` manifest entry —
 * `startActivity`'s own intent resolution is exempt from that filtering, so
 * flags on the intent reach whichever activity the system actually launches.
 * [onCaptured] fires with the written `Uri` and whether it was a video; a
 * cancelled/failed capture deletes the (possibly empty) destination file
 * rather than leaving an orphaned cache entry, and a successful one is
 * deleted once [onCaptured] — a suspend callback, so a caller can read its
 * bytes off the main thread before the file disappears — returns. Either
 * way the granted Uri permission is revoked afterwards. [pendingUri] is
 * `rememberSaveable` so a process death mid-capture (common while filming
 * video) still resolves the launcher's result against the right file.
 *
 * Android-runtime activity-result glue: coverage-exempt per this module's
 * existing precedent (`FeedComposerSheet`'s identical launchers,
 * `readPickedAttachment` in this same file's neighbour `ChatScreen.kt`).
 */
@Composable
fun rememberChatCameraCapture(onCaptured: suspend (uri: Uri, isVideo: Boolean) -> Unit): ChatCameraCaptureLaunchers {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var pendingUri by rememberSaveable(stateSaver = UriSaver) { mutableStateOf<Uri?>(null) }

    fun finish(uri: Uri?, success: Boolean, isVideo: Boolean) {
        scope.launch {
            if (success && uri != null) {
                onCaptured(uri, isVideo)
                runCatching { context.contentResolver.delete(uri, null, null) }
            } else {
                uri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
            }
            uri?.let {
                runCatching {
                    context.revokeUriPermission(
                        it,
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    )
                }
            }
        }
    }

    val takePicture = rememberLauncherForActivityResult(GrantingTakePicture()) { success ->
        val uri = pendingUri
        pendingUri = null
        finish(uri, success, isVideo = false)
    }
    val captureVideo = rememberLauncherForActivityResult(GrantingCaptureVideo()) { success ->
        val uri = pendingUri
        pendingUri = null
        finish(uri, success, isVideo = true)
    }

    return ChatCameraCaptureLaunchers(
        launchPhotoImpl = {
            val uri = context.createChatCaptureUri(ChatCameraCaptureFile.next(System.currentTimeMillis()))
            pendingUri = uri
            takePicture.launch(uri)
        },
        launchVideoImpl = {
            val uri = context.createChatCaptureUri(ChatCameraCaptureFile.nextVideo(System.currentTimeMillis()))
            pendingUri = uri
            captureVideo.launch(uri)
        },
    )
}

private val UriSaver = Saver<Uri?, String>(
    save = { it?.toString() },
    restore = { it.takeIf { s -> s.isNotEmpty() }?.let(Uri::parse) },
)

/**
 * [ActivityResultContracts.TakePicture] adds `EXTRA_OUTPUT` but no write
 * grant on the intent it hands to the resolved camera activity; this adds
 * the flags directly rather than relying on `queryIntentActivities`, which
 * package-visibility can render blind. Mirrored by [GrantingCaptureVideo].
 */
private class GrantingTakePicture : ActivityResultContract<Uri, Boolean>() {
    private val delegate = ActivityResultContracts.TakePicture()

    override fun createIntent(context: Context, input: Uri): Intent =
        delegate.createIntent(context, input)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)

    override fun getSynchronousResult(context: Context, input: Uri) =
        delegate.getSynchronousResult(context, input)

    override fun parseResult(resultCode: Int, intent: Intent?): Boolean =
        delegate.parseResult(resultCode, intent)
}

private class GrantingCaptureVideo : ActivityResultContract<Uri, Boolean>() {
    private val delegate = ActivityResultContracts.CaptureVideo()

    override fun createIntent(context: Context, input: Uri): Intent =
        delegate.createIntent(context, input)
            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)

    override fun getSynchronousResult(context: Context, input: Uri) =
        delegate.getSynchronousResult(context, input)

    override fun parseResult(resultCode: Int, intent: Intent?): Boolean =
        delegate.parseResult(resultCode, intent)
}

private fun Context.createChatCaptureUri(fileName: String): Uri {
    val capturesDir = File(cacheDir, "captures").apply { mkdirs() }
    val file = File(capturesDir, fileName)
    return FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
}

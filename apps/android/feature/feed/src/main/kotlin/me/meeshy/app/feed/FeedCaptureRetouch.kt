package me.meeshy.app.feed

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerLookPerson
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import me.meeshy.ui.component.retouch.ComposerRetouchResult
import me.meeshy.ui.component.retouch.ComposerRetouchScreen
import me.meeshy.ui.component.retouch.ComposerVideoRetouchResult
import me.meeshy.ui.component.retouch.ComposerVideoRetouchScreen
import me.meeshy.ui.component.retouch.RetouchVideoProbe
import me.meeshy.ui.component.retouch.RetouchSourceDecoder

/** Une photo prise depuis la feuille de création d'un post, en attente de sa retouche (#12735). */
internal class FeedRetouchPending(val item: MediaUploadItem, val bitmap: Bitmap) {
    companion object {
        /** La prise décodée ; `null` si elle ne se décode pas (elle part alors telle quelle). */
        fun of(item: MediaUploadItem): FeedRetouchPending? = RetouchSourceDecoder.decode(item.bytes)?.let { FeedRetouchPending(item, it) }
    }
}

/** « Terminé » : intouchée, la prise part avec ses octets d'origine ; retouchée, en JPEG. */
internal object FeedRetouchDelivery {
    const val JPEG_QUALITY = 92
    const val JPEG_MIME = "image/jpeg"

    fun item(pending: FeedRetouchPending, result: ComposerRetouchResult): MediaUploadItem = when (result) {
        ComposerRetouchResult.Original -> pending.item
        is ComposerRetouchResult.Rendered -> MediaUploadItem(
            bytes = ByteArrayOutputStream().also { result.bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }.toByteArray(),
            fileName = pending.item.fileName.substringBeforeLast('.').ifEmpty { "photo" } + "_retouche.jpg",
            mimeType = JPEG_MIME,
        )
    }
}

/** La retouche unique de la photo prise pour un post (#12735) : [onDeliver] reçoit ce qui se téléverse. */
@Composable
internal fun FeedCaptureRetouchHost(pending: FeedRetouchPending, onDeliver: (MediaUploadItem) -> Unit, onDismiss: () -> Unit) {
    val author = remember {
        val now = Date()
        val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(now)
        val person = ComposerLookPerson.author(null, null, null)
        ComposerLookAuthor(person.id, person.name, person.handle, CallMontageCaption(CallMontageCaption.BRAND_TITLE, date, DateFormat.getTimeInstance(DateFormat.SHORT).format(now)), date)
    }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        ComposerRetouchScreen(
            source = pending.bitmap,
            author = author,
            onDone = { result -> onDeliver(withContext(Dispatchers.Default) { FeedRetouchDelivery.item(pending, result) }) },
            onCancel = onDismiss,
        )
    }
}

/** Une vidéo prise depuis la feuille de création d'un post, copiée dans le dossier de prises, en attente de sa retouche (#12735). */
internal class FeedVideoRetouchPending(val source: File, val output: File, val probe: RetouchVideoProbe, val fileName: String) {
    /** Les deux fichiers de la retouche quittent le cache une fois la vidéo partie ou abandonnée. */
    fun discard() {
        runCatching { source.delete() }
        runCatching { output.delete() }
    }

    companion object {
        /** La vidéo copiée et lue ; `null` si elle ne se lit pas (elle part alors telle quelle). */
        suspend fun of(context: Context, uri: Uri, fileName: String, nowMillis: Long): FeedVideoRetouchPending? = withContext(Dispatchers.IO) {
            val dir = File(context.cacheDir, "captures").apply { mkdirs() }
            val source = File(dir, "feed_video_source_$nowMillis.mp4")
            val copied = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input -> source.outputStream().use { input.copyTo(it) } }
            }.getOrNull()
            val probe = copied?.let { RetouchVideoProbe.of(source) }
            if (probe == null) {
                source.delete()
                return@withContext null
            }
            FeedVideoRetouchPending(source, File(dir, "feed_video_retouche_$nowMillis.mp4"), probe, fileName)
        }
    }
}

/** « Terminé » d'une vidéo : intouchée, elle part sous son nom de prise ; retouchée, depuis son rendu. */
internal object FeedVideoRetouchDelivery {
    const val VIDEO_MIME = "video/mp4"

    fun item(pending: FeedVideoRetouchPending, file: File): MediaUploadItem? {
        val bytes = runCatching { file.readBytes() }.getOrNull()?.takeIf { it.isNotEmpty() } ?: return null
        val name = if (file == pending.source) pending.fileName else pending.fileName.substringBeforeLast('.').ifEmpty { "video" } + "_retouche.mp4"
        return MediaUploadItem(bytes = bytes, fileName = name, mimeType = VIDEO_MIME)
    }
}

/** La retouche unique de la vidéo prise pour un post (#12735) : [onDeliver] reçoit ce qui se téléverse. */
@Composable
internal fun FeedVideoRetouchHost(pending: FeedVideoRetouchPending, onDeliver: (MediaUploadItem?) -> Unit, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        ComposerVideoRetouchScreen(
            source = pending.source,
            probe = pending.probe,
            output = pending.output,
            onDone = { result ->
                val file = when (result) {
                    ComposerVideoRetouchResult.Original -> pending.source
                    is ComposerVideoRetouchResult.Rendered -> result.file
                }
                val item = withContext(Dispatchers.IO) { FeedVideoRetouchDelivery.item(pending, file).also { pending.discard() } }
                onDeliver(item)
            },
            onCancel = onDismiss,
        )
    }
}

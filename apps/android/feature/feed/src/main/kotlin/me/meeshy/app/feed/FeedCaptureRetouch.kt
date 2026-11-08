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
import androidx.compose.ui.platform.LocalContext
import me.meeshy.sdk.media.MediaIntake
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.sdk.model.composer.look.ComposerLookPerson
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import me.meeshy.ui.component.retouch.ComposerRetouchResult
import me.meeshy.ui.component.retouch.ComposerRetouchScreen
import me.meeshy.ui.component.retouch.ComposerVideoRetouchResult
import me.meeshy.ui.component.retouch.ComposerVideoRetouchScreen
import me.meeshy.ui.component.retouch.RetouchExif
import me.meeshy.ui.component.retouch.RetouchVideoProbe
import me.meeshy.ui.component.retouch.RetouchSourceDecoder

/**
 * Une photo du bandeau d'un commentaire, en attente de sa retouche (#12735) : son original et, rouverte, la retouche qu'elle
 * porte déjà ([previous], #14844).
 */
internal class FeedRetouchPending(val item: MediaUploadItem, val bitmap: Bitmap, val previous: CommentPieceRetouch? = null) {
    companion object {
        /** La prise décodée ; `null` si elle ne se décode pas (elle part alors telle quelle). */
        fun of(item: MediaUploadItem, previous: CommentPieceRetouch? = null): FeedRetouchPending? =
            RetouchSourceDecoder.decode(item.bytes)?.let { FeedRetouchPending(item, it, previous) }
    }
}

/** Ce que « Terminé » met au bandeau : ce qui se téléverse, et la retouche qui reste modifiable. */
internal data class FeedRetouchedPiece(val item: MediaUploadItem, val retouch: CommentPieceRetouch?)

/**
 * « Terminé » : intouchée, la prise garde ses octets d'origine ; retouchée, sa cuisson en JPEG se téléverse et
 * l'original reste à côté avec sa recette (#14844). `null` : rien ne change au bandeau.
 */
internal object FeedRetouchDelivery {
    const val JPEG_QUALITY = 92
    const val JPEG_MIME = "image/jpeg"

    fun delivered(pending: FeedRetouchPending, result: ComposerRetouchResult, author: ComposerLookAuthor): FeedRetouchedPiece? = when (result) {
        ComposerRetouchResult.Original -> pending.previous?.let { FeedRetouchedPiece(pending.item, retouch = null) }
        is ComposerRetouchResult.Rendered -> if (result.recipe == pending.previous?.recipe) {
            null
        } else {
            FeedRetouchedPiece(
                item = MediaUploadItem(
                    bytes = RetouchExif.jpeg(result.bitmap, like = pending.item.bytes),
                    fileName = pending.item.fileName.substringBeforeLast('.').ifEmpty { "photo" } + "_retouche.jpg",
                    mimeType = JPEG_MIME,
                ),
                retouch = CommentPieceRetouch(pending.item, result.recipe, author),
            )
        }
    }
}

/** L'auteur et la séance que les cadres écrivent : la marque, la date et l'heure de la prise. */
@Composable
private fun rememberFeedRetouchAuthor(): ComposerLookAuthor = remember {
    val now = Date()
    val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(now)
    val person = ComposerLookPerson.author(null, null, null)
    ComposerLookAuthor(person.id, person.name, person.handle, CallMontageCaption(CallMontageCaption.BRAND_TITLE, date, DateFormat.getTimeInstance(DateFormat.SHORT).format(now)), date)
}

/**
 * La retouche unique d'une photo du bandeau (#12735), rouverte sur sa recette (#14844) : [onDeliver] reçoit ce qui change
 * au bandeau, `null` si rien ne change.
 */
@Composable
internal fun FeedCaptureRetouchHost(pending: FeedRetouchPending, onDeliver: (FeedRetouchedPiece?) -> Unit, onDismiss: () -> Unit) {
    val fresh = rememberFeedRetouchAuthor()
    val author = pending.previous?.author ?: fresh
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        ComposerRetouchScreen(
            source = pending.bitmap,
            author = author,
            onDone = { result -> onDeliver(withContext(Dispatchers.Default) { FeedRetouchDelivery.delivered(pending, result, author) }) },
            onCancel = onDismiss,
            initial = pending.previous?.recipe,
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

    fun item(pending: FeedVideoRetouchPending, file: File, cacheDir: File): MediaUploadItem? {
        val name = if (file == pending.source) pending.fileName else pending.fileName.substringBeforeLast('.').ifEmpty { "video" } + "_retouche.mp4"
        return MediaIntake.adopt(file, cacheDir, name, VIDEO_MIME)
    }
}

/** La retouche unique de la vidéo prise pour un post (#12735) : [onDeliver] reçoit ce qui se téléverse. */
@Composable
internal fun FeedVideoRetouchHost(pending: FeedVideoRetouchPending, onDeliver: (MediaUploadItem?) -> Unit, onDismiss: () -> Unit) {
    val author = rememberFeedRetouchAuthor()
    val cacheDir = LocalContext.current.cacheDir
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        ComposerVideoRetouchScreen(
            source = pending.source,
            probe = pending.probe,
            output = pending.output,
            author = author,
            onDone = { result ->
                val file = when (result) {
                    ComposerVideoRetouchResult.Original -> pending.source
                    is ComposerVideoRetouchResult.Rendered -> result.file
                }
                val item = withContext(Dispatchers.IO) { FeedVideoRetouchDelivery.item(pending, file, cacheDir).also { pending.discard() } }
                onDeliver(item)
            },
            onCancel = onDismiss,
        )
    }
}

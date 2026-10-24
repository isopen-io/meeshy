package me.meeshy.app.chat

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.call.montage.CallMontageCaption
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import me.meeshy.ui.component.retouch.ComposerRetouchResult
import me.meeshy.ui.component.retouch.ComposerRetouchScreen
import me.meeshy.ui.component.retouch.ComposerVideoRetouchResult
import me.meeshy.ui.component.retouch.ComposerVideoRetouchScreen
import me.meeshy.ui.component.retouch.RetouchVideoProbe
import me.meeshy.ui.component.retouch.RetouchSourceDecoder

/** Une photo prise, en attente de sa retouche : ses octets d'origine et ses pixels debout. */
internal class ChatRetouchPending(val bytes: ByteArray, val fileName: String, val mimeType: String?, val bitmap: Bitmap) {
    companion object {
        /** La prise décodée ; `null` si elle ne se décode pas (elle part alors telle quelle, sans retouche). */
        fun of(bytes: ByteArray, fileName: String, mimeType: String?): ChatRetouchPending? =
            RetouchSourceDecoder.decode(bytes)?.let { ChatRetouchPending(bytes, fileName, mimeType, it) }
    }
}

/** Ce qui part après la retouche : un fichier, ses octets, son type. */
internal data class ChatRetouchedFile(val bytes: ByteArray, val fileName: String, val mimeType: String?) {
    override fun equals(other: Any?): Boolean =
        other is ChatRetouchedFile && bytes.contentEquals(other.bytes) && fileName == other.fileName && mimeType == other.mimeType

    override fun hashCode(): Int = bytes.contentHashCode() * 31 + fileName.hashCode()
}

/** « Terminé » : la prise intouchée part avec ses octets d'origine ; une prise retouchée part en JPEG. */
internal object ChatRetouchDelivery {
    const val JPEG_QUALITY = 92
    const val JPEG_MIME = "image/jpeg"
    const val VIDEO_MIME = "video/mp4"

    fun file(pending: ChatRetouchPending, result: ComposerRetouchResult, nowMillis: Long): ChatRetouchedFile = when (result) {
        ComposerRetouchResult.Original -> ChatRetouchedFile(pending.bytes, pending.fileName, pending.mimeType)
        is ComposerRetouchResult.Rendered -> ChatRetouchedFile(jpeg(result.bitmap), ChatCameraCaptureFile.nextRetouched(nowMillis), JPEG_MIME)
    }

    private fun jpeg(bitmap: Bitmap): ByteArray =
        ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }.toByteArray()
}

/**
 * La retouche unique d'une photo prise depuis le composer (#12614) : plein écran, au-dessus du fil. Elle ne
 * répond qu'une fois — [onDeliver] avec le fichier qui part, ou [onDismiss] quand elle est abandonnée.
 */
@Composable
internal fun ChatCaptureRetouchHost(pending: ChatRetouchPending, onDeliver: suspend (ChatRetouchedFile) -> Unit, onDismiss: () -> Unit) {
    val author = rememberRetouchAuthor()
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        ComposerRetouchScreen(
            source = pending.bitmap,
            author = author,
            onDone = { result ->
                val file = withContext(Dispatchers.Default) { ChatRetouchDelivery.file(pending, result, System.currentTimeMillis()) }
                onDeliver(file)
            },
            onCancel = onDismiss,
        )
    }
}

/** L'auteur et la séance que les cadres écrivent : la marque, la date et l'heure de la prise. */
@Composable
private fun rememberRetouchAuthor(): ComposerLookAuthor = remember {
    val now = Date()
    val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(now)
    val clock = DateFormat.getTimeInstance(DateFormat.SHORT).format(now)
    ComposerLookAuthor(
        id = "self",
        name = "",
        handle = null,
        caption = CallMontageCaption(CallMontageCaption.BRAND_TITLE, date, clock),
        date = date,
    )
}

/** Le fichier retouché, posé dans le dossier de prises du `FileProvider`, pour la mise en attente par adresse. */
internal suspend fun Context.writeRetouchedCapture(file: ChatRetouchedFile): Uri = withContext(Dispatchers.IO) {
    val capturesDir = File(cacheDir, "captures").apply { mkdirs() }
    val written = File(capturesDir, file.fileName).apply { writeBytes(file.bytes) }
    androidx.core.content.FileProvider.getUriForFile(this@writeRetouchedCapture, "$packageName.fileprovider", written)
}

/** Une vidéo prise, copiée hors de l'intention système, en attente de sa retouche. */
internal class ChatVideoRetouchPending(val source: File, val output: File, val probe: RetouchVideoProbe) {
    /** Les deux fichiers de la retouche quittent le cache une fois la vidéo mise en attente ou abandonnée. */
    fun discard() {
        runCatching { source.delete() }
        runCatching { output.delete() }
    }

    companion object {
        /** La vidéo copiée dans le dossier de prises ; `null` si elle ne se lit pas (elle part alors telle quelle). */
        suspend fun of(context: Context, uri: Uri, nowMillis: Long): ChatVideoRetouchPending? = withContext(Dispatchers.IO) {
            val dir = File(context.cacheDir, "captures").apply { mkdirs() }
            val source = File(dir, ChatCameraCaptureFile.nextVideoSource(nowMillis))
            val copied = runCatching {
                context.contentResolver.openInputStream(uri)?.use { input -> source.outputStream().use { input.copyTo(it) } }
            }.getOrNull()
            val probe = copied?.let { RetouchVideoProbe.of(source) }
            if (probe == null) {
                source.delete()
                return@withContext null
            }
            ChatVideoRetouchPending(source, File(dir, ChatCameraCaptureFile.nextRetouchedVideo(nowMillis)), probe)
        }
    }
}

/** La retouche unique d'une vidéo prise depuis le composer (#12650) : [onDeliver] reçoit le fichier qui part. */
@Composable
internal fun ChatVideoRetouchHost(pending: ChatVideoRetouchPending, onDeliver: suspend (File) -> Unit, onDismiss: () -> Unit) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false, decorFitsSystemWindows = false),
    ) {
        ComposerVideoRetouchScreen(
            source = pending.source,
            probe = pending.probe,
            output = pending.output,
            onDone = { result ->
                onDeliver(
                    when (result) {
                        ComposerVideoRetouchResult.Original -> pending.source
                        is ComposerVideoRetouchResult.Rendered -> result.file
                    },
                )
            },
            onCancel = onDismiss,
        )
    }
}

/** Une vidéo du dossier de prises, offerte par le `FileProvider` à la mise en attente par adresse. */
internal fun Context.captureUri(file: File): Uri =
    androidx.core.content.FileProvider.getUriForFile(this, "$packageName.fileprovider", file)

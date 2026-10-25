package me.meeshy.app.feed

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.io.ByteArrayOutputStream
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

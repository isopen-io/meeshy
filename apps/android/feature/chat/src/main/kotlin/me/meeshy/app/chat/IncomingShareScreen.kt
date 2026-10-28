package me.meeshy.app.chat

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.MimeTypeResolver
import me.meeshy.sdk.model.share.ShareLimits

/**
 * « Partager vers Meeshy » depuis une autre app (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`, #13476) : la même
 * feuille de partage unique que partout dans l'app, avec ce que l'autre app remet — texte, lien, fichiers.
 * Hébergée par `ShareTargetActivity` (`:app`), qui ne fait qu'extraire l'intent.
 *
 * Les fichiers sont copiés EN FLUX dans le cache privé, hors du fil principal, avant que la feuille s'ouvre :
 * un envoi ne part jamais avec une pièce encore en cours de copie. Une pièce illisible (droit révoqué, plafond
 * d'octets dépassé) est écartée ; rien à envoyer du tout ferme le partage. Au plus [ShareLimits.MAX_FILES]
 * fichiers par envoi.
 */
@Composable
fun IncomingShareScreen(
    sharedText: String?,
    sharedUris: List<Uri>,
    sharedMimeType: String?,
    onFinished: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    /** « Modifier dans le studio » : la pièce reçue s'ouvre dans le composeur au lieu de partir vers une conversation. Absent, rien n'est offert. */
    onEditInStudio: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val prepared by produceState<List<MediaUploadItem>?>(initialValue = null, sharedUris) {
        value = withContext(Dispatchers.IO) {
            sharedUris.take(ShareLimits.MAX_FILES).mapNotNull { uri ->
                val picked = readPickedAttachment(context, uri)
                if (picked == null || picked.file.length() == 0L) {
                    picked?.file?.delete()
                    return@mapNotNull null
                }
                MediaUploadItem.onDisk(picked.file, picked.fileName.trim().ifBlank { "attachment" }, MimeTypeResolver.resolve(picked.mimeType ?: sharedMimeType, picked.fileName))
            }
        }
    }
    val items = prepared ?: return
    if (items.isEmpty() && sharedText.isNullOrBlank()) {
        LaunchedEffect(Unit) { onFinished() }
        return
    }
    IncomingShareSheetHost(
        text = sharedText,
        items = items,
        onDismiss = onFinished,
        onOpenConversation = onOpenConversation,
        onEditInStudio = onEditInStudio.takeIf { studioCanEdit(items) },
    )
}


/**
 * Le studio retouche des photos et des vidéos : un document (PDF, tableur…) n'y entre pas, et une sélection qui en
 * contient un ne propose pas « Modifier dans le studio » (le document serait écarté en silence) — elle part comme fichiers (#13585).
 */
internal fun studioCanEdit(items: List<MediaUploadItem>): Boolean =
    items.isNotEmpty() && items.all {
        val type = AttachmentMessageType.forMime(it.mimeType)
        type == AttachmentMessageType.IMAGE || type == AttachmentMessageType.VIDEO
    }

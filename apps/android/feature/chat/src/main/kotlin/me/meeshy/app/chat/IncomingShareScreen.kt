package me.meeshy.app.chat

import android.content.Context
import android.text.format.Formatter
import android.widget.Toast
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.feature.chat.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import me.meeshy.sdk.model.share.ShareLimits

/**
 * « Partager vers Meeshy » depuis une autre app (`ACTION_SEND` / `ACTION_SEND_MULTIPLE`, #13476) : la même
 * feuille de partage unique que partout dans l'app, avec ce que l'autre app remet — texte, lien, fichiers.
 * Hébergée par `ShareTargetActivity` (`:app`), qui ne fait qu'extraire l'intent.
 *
 * Les fichiers sont copiés EN FLUX dans le cache privé, hors du fil principal, avant que la feuille s'ouvre :
 * un envoi ne part jamais avec une pièce encore en cours de copie. Une pièce illisible (droit révoqué, plafond
 * d'octets dépassé) est écartée, et ce qui est écarté est DIT, une raison par sorte comme l'extension iOS
 * ([IncomingShortfall]) : dans la feuille, ou en message bref quand il ne reste rien à envoyer. Au plus [ShareLimits.MAX_FILES]
 * fichiers par envoi.
 */
@Composable
fun IncomingShareScreen(
    sharedText: String?,
    selection: IncomingShareSelection,
    sharedMimeType: String?,
    onFinished: () -> Unit,
    onOpenConversation: (conversationId: String) -> Unit,
    /** « Modifier dans le studio » : la pièce reçue s'ouvre dans le composeur au lieu de partir vers une conversation. Absent, rien n'est offert. */
    onEditInStudio: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val prepared by produceState<IncomingPrepared?>(initialValue = null, selection) {
        value = withContext(Dispatchers.IO) {
            val reads = selection.admitted.map { readIncomingAttachment(context, it, sharedMimeType) }
            IncomingPrepared(
                items = reads.filterIsInstance<IncomingRead.Copied>().map { it.item },
                notices = IncomingShortfall.of(reads, selection).map { incomingShortfallText(context, it) },
            )
        }
    }
    val ready = prepared ?: return
    val items = ready.items
    if (items.isEmpty() && sharedText.isNullOrBlank()) {
        LaunchedEffect(Unit) {
            ready.notices.forEach { Toast.makeText(context, it, Toast.LENGTH_LONG).show() }
            onFinished()
        }
        return
    }
    IncomingShareSheetHost(
        text = sharedText,
        items = items,
        notices = ready.notices,
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

private data class IncomingPrepared(val items: List<MediaUploadItem>, val notices: List<String>)

/** Le texte de ce que le partage laisse derrière lui — les clés de l'extension iOS (`ShareSheetCopy.shortfall`). */
internal fun incomingShortfallText(context: Context, shortfall: IncomingShortfall): String = when (shortfall) {
    IncomingShortfall.RefusedSource -> context.getString(R.string.share_content_refused_source)
    IncomingShortfall.Unprepared -> context.getString(R.string.share_content_unprepared)
    is IncomingShortfall.OverBudget -> context.getString(
        R.string.share_content_over_budget,
        shortfall.uncopied,
        ShareLimits.MAX_FILES,
        Formatter.formatShortFileSize(context, binaryBytesAsDecimal(ShareLimits.MAX_TOTAL_BYTES)),
    )
    is IncomingShortfall.TooLarge -> context.getString(
        R.string.chat_tray_too_large,
        shortfall.fileNames.joinToString(", "),
        ComposerAttachmentLimits.MAX_UPLOAD_MEGABYTES,
    )
}

/** iOS affiche le plafond en unités binaires (« 5 Go ») ; le formateur Android compte en unités décimales. */
private fun binaryBytesAsDecimal(bytes: Long): Long = bytes / (1L shl 30) * 1_000_000_000L

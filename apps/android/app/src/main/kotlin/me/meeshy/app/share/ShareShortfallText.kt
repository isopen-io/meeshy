package me.meeshy.app.share

import android.content.Context
import android.text.format.Formatter
import me.meeshy.feature.chat.R
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AttachmentMessageType
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits
import me.meeshy.sdk.model.share.ShareLimits
import me.meeshy.sdk.model.share.ShareShortfall
import me.meeshy.sdk.model.share.ShareStagingPolicy

/** Ce que le partage laisse derrière lui, une phrase par sorte (les clés de l'extension iOS, `ShareSheetCopy.shortfall`). */
fun shortfallMessages(context: Context, shortfalls: List<ShareShortfall>): List<String> = shortfalls.map { shortfall ->
    when (shortfall) {
        ShareShortfall.RefusedSource -> context.getString(R.string.share_content_refused_source)
        ShareShortfall.Unprepared -> context.getString(R.string.share_content_unprepared)
        is ShareShortfall.OverBudget -> context.getString(
            R.string.share_content_over_budget,
            shortfall.uncopied,
            ShareLimits.MAX_FILES,
            Formatter.formatShortFileSize(context, ShareStagingPolicy.MAX_STAGED_BYTES / (1L shl 20) * 1_000_000L),
        )
    }
}

/** Une phrase par pièce trop lourde pour partir, qui la nomme (le libellé du plateau du composeur, même plafond). */
fun tooLargeMessages(context: Context, fileNames: List<String>): List<String> = fileNames.map { name ->
    context.getString(R.string.chat_tray_too_large, name, ComposerAttachmentLimits.MAX_UPLOAD_MEGABYTES)
}

/**
 * Le studio retouche des photos et des vidéos : un document n'y entre pas, et une sélection qui en contient un ne propose pas
 * « Modifier dans le studio » (le document serait écarté en silence) — elle part comme fichiers.
 */
fun canEditInStudio(items: List<MediaUploadItem>): Boolean =
    items.isNotEmpty() && items.all {
        val type = AttachmentMessageType.forMime(it.mimeType)
        type == AttachmentMessageType.IMAGE || type == AttachmentMessageType.VIDEO
    }

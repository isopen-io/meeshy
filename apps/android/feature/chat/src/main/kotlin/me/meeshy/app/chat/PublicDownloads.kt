package me.meeshy.app.chat

import android.os.Build
import me.meeshy.sdk.model.MimeTypeResolver

/**
 * Comment « Enregistrer » une pièce atteint les Téléchargements PUBLICS à ce niveau d'API : CLOISONNÉ (29+,
 * `MediaStore.Downloads`, sans permission) ou HISTORIQUE (26–28, dossier public sous `WRITE_EXTERNAL_STORAGE`, demandée
 * au geste par la porte unique `PermissionNature.PHOTO_LIBRARY_ADD`).
 */
enum class PublicDownloadsRoute {
    SCOPED,
    LEGACY,
    ;

    companion object {
        fun of(sdkInt: Int): PublicDownloadsRoute = if (sdkInt >= Build.VERSION_CODES.Q) SCOPED else LEGACY
    }
}

/** Le nom sous lequel une pièce atterrit dans les Téléchargements. Pur. */
internal object PublicDownloadName {

    /** Nettoyé comme un fichier reçu d'une autre app ([IncomingFileName]) ; un nom inexploitable devient `attachment.<ext>`. */
    fun safe(raw: String?, mimeType: String): String =
        IncomingFileName.sanitized(raw, mimeType) ?: "attachment.${MimeTypeResolver.preferredExtensionForMime(mimeType) ?: "bin"}"

    /** Le premier nom libre : `contrat.pdf`, puis `contrat (1).pdf`, `contrat (2).pdf`… — jamais d'écrasement. */
    fun unique(name: String, exists: (String) -> Boolean): String {
        if (!exists(name)) return name
        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        val extension = if (dot > 0) name.substring(dot) else ""
        var index = 1
        while (exists("$stem ($index)$extension")) index++
        return "$stem ($index)$extension"
    }
}

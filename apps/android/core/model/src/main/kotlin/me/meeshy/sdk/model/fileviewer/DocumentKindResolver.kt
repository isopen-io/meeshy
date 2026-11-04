package me.meeshy.sdk.model.fileviewer

import java.util.Locale
import me.meeshy.sdk.model.contacts.vcard.ContactCardFile
import me.meeshy.sdk.model.media.AttachmentKind

/**
 * La famille d'un document pour sa carte (miroir de `DocumentMediaType.detect`, iOS) : le type MIME d'abord, puis
 * l'extension du nom quand le type est générique (`application/octet-stream`, vide). Une carte de visite n'est jamais
 * rangée avec le code ou le texte : elle a sa propre carte.
 */
object DocumentKindResolver {

    private val byExtension: Map<String, AttachmentKind> = buildMap {
        put("pdf", AttachmentKind.PDF)
        listOf("doc", "docx", "rtf", "odt", "pages").forEach { put(it, AttachmentKind.DOCUMENT) }
        listOf("xls", "xlsx", "csv", "ods", "numbers").forEach { put(it, AttachmentKind.SPREADSHEET) }
        listOf("ppt", "pptx", "odp", "key").forEach { put(it, AttachmentKind.PRESENTATION) }
        listOf("zip", "tar", "gz", "7z", "rar").forEach { put(it, AttachmentKind.ARCHIVE) }
        listOf("txt", "text", "log").forEach { put(it, AttachmentKind.TEXT) }
    }

    fun kindOf(mimeType: String?, fileName: String?): AttachmentKind {
        val mime = mimeType.orEmpty()
        val name = fileName.orEmpty()
        if (ContactCardFile.isContactCard(mime, name)) return AttachmentKind.OTHER
        val fromMime = AttachmentKind.fromMime(mime)
        if (fromMime != AttachmentKind.OTHER && fromMime != AttachmentKind.TEXT) return fromMime
        val extension = name.lowercase(Locale.ROOT).substringAfterLast('.', "")
        byExtension[extension]?.let { return it }
        if (CodeLanguage.detect(name, mime) != null) return AttachmentKind.CODE
        return fromMime
    }
}

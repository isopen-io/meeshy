package me.meeshy.sdk.model

import me.meeshy.sdk.model.media.AttachmentKind
import java.util.Locale

/**
 * La CLASSE de rendu d'une pièce dans la bulle (iOS `BubbleContentBuilder.classify`) : ce qui décide de sa
 * rangée, distinct de la famille MIME ([AttachmentKind]). Une carte de visite est testée AVANT toute famille de
 * code : `text/vcard` ou `.vcf` est un contact, jamais un fichier texte.
 */
public enum class AttachmentPieceClass {
    Image, Video, Audio, Contact, Location, File;

    public companion object {
        private const val LOCATION_MIME = "application/x-location"
        private val vcardMimes = setOf("text/vcard", "text/x-vcard", "text/directory")

        public fun isContactCard(mimeType: String?, fileName: String?): Boolean =
            baseMime(mimeType) in vcardMimes || fileName.orEmpty().trim().lowercase(Locale.ROOT).endsWith(".vcf")

        public fun classify(mimeType: String?, fileName: String? = null): AttachmentPieceClass {
            if (isContactCard(mimeType, fileName)) return Contact
            val mime = baseMime(mimeType)
            return when {
                mime == LOCATION_MIME -> Location
                mime.startsWith("image/") -> Image
                mime.startsWith("video/") -> Video
                mime.startsWith("audio/") -> Audio
                else -> File
            }
        }

        /** La famille MIME, avec repli sur l'extension quand le type est vide ou générique. */
        public fun familyOf(mimeType: String?, fileName: String? = null): AttachmentKind {
            val byMime = AttachmentKind.fromMime(mimeType)
            val generic = baseMime(mimeType).let { it.isEmpty() || it == "application/octet-stream" }
            if (!generic) return byMime
            val ext = fileName.orEmpty().trim().lowercase(Locale.ROOT).substringAfterLast('.', "")
            return extensionFamilies[ext] ?: byMime
        }

        private fun baseMime(mimeType: String?): String =
            mimeType.orEmpty().substringBefore(';').trim().lowercase(Locale.ROOT)

        private val extensionFamilies: Map<String, AttachmentKind> = mapOf(
            "pdf" to AttachmentKind.PDF,
            "xls" to AttachmentKind.SPREADSHEET, "xlsx" to AttachmentKind.SPREADSHEET, "csv" to AttachmentKind.SPREADSHEET,
            "doc" to AttachmentKind.DOCUMENT, "docx" to AttachmentKind.DOCUMENT, "rtf" to AttachmentKind.DOCUMENT,
            "ppt" to AttachmentKind.PRESENTATION, "pptx" to AttachmentKind.PRESENTATION,
            "zip" to AttachmentKind.ARCHIVE, "tar" to AttachmentKind.ARCHIVE, "7z" to AttachmentKind.ARCHIVE,
            "gz" to AttachmentKind.ARCHIVE, "rar" to AttachmentKind.ARCHIVE,
            "json" to AttachmentKind.CODE, "xml" to AttachmentKind.CODE,
            "txt" to AttachmentKind.TEXT, "md" to AttachmentKind.TEXT,
            "jpg" to AttachmentKind.IMAGE, "jpeg" to AttachmentKind.IMAGE, "png" to AttachmentKind.IMAGE,
            "gif" to AttachmentKind.IMAGE, "webp" to AttachmentKind.IMAGE, "heic" to AttachmentKind.IMAGE,
            "mp4" to AttachmentKind.VIDEO, "mov" to AttachmentKind.VIDEO, "webm" to AttachmentKind.VIDEO,
            "mp3" to AttachmentKind.AUDIO, "m4a" to AttachmentKind.AUDIO, "wav" to AttachmentKind.AUDIO,
            "ogg" to AttachmentKind.AUDIO, "aac" to AttachmentKind.AUDIO,
        )
    }
}

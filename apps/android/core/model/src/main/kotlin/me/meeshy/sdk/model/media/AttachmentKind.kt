package me.meeshy.sdk.model.media

import java.util.Locale

/** Catégorie sémantique d'une pièce jointe dérivée de son MIME (iOS `AttachmentKind`). */
public enum class AttachmentKind {
    IMAGE, VIDEO, AUDIO, PDF, SPREADSHEET, DOCUMENT, PRESENTATION, ARCHIVE, CODE, TEXT, OTHER;

    public val isMedia: Boolean get() = this == IMAGE || this == VIDEO || this == AUDIO
    public val hasTimebasedTrack: Boolean get() = this == AUDIO || this == VIDEO

    public companion object {
        private val spreadsheet = setOf(
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
        )
        private val document = setOf(
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/rtf",
        )
        private val presentation = setOf(
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        private val archive = setOf(
            "application/zip", "application/x-zip-compressed", "application/x-tar",
            "application/x-7z-compressed", "application/gzip", "application/x-rar-compressed",
        )
        private val code = setOf("application/json", "application/xml", "text/xml")

        /** Insensible à la casse et aux paramètres (`; charset=…`). Vide ou inconnu = [OTHER]. */
        public fun fromMime(mimeType: String?): AttachmentKind {
            val mime = mimeType.orEmpty().substringBefore(';').trim().lowercase(Locale.ROOT)
            return when {
                mime == "application/pdf" -> PDF
                mime in spreadsheet -> SPREADSHEET
                mime in document -> DOCUMENT
                mime in presentation -> PRESENTATION
                mime in archive -> ARCHIVE
                mime in code -> CODE
                mime.startsWith("image/") -> IMAGE
                mime.startsWith("video/") -> VIDEO
                mime.startsWith("audio/") -> AUDIO
                mime.startsWith("text/") -> TEXT
                else -> OTHER
            }
        }
    }
}

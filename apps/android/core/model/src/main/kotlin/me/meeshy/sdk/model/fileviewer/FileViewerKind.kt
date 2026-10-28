package me.meeshy.sdk.model.fileviewer

import java.util.Locale
import me.meeshy.sdk.model.contacts.vcard.ContactCardFile

/**
 * Où s'ouvre une pièce-fichier du fil : la fiche d'une carte de visite, la visionneuse de code, l'aperçu
 * d'un PDF, ou la fiche d'un document sans aperçu de page (miroir de l'aiguillage de `BubbleAttachmentView`, iOS).
 */
sealed interface FileViewerKind {
    data object ContactCard : FileViewerKind
    data class Code(val language: CodeLanguage) : FileViewerKind
    data object Pdf : FileViewerKind
    data object Document : FileViewerKind

    companion object {
        private const val PDF_MIME = "application/pdf"

        fun of(mimeType: String?, fileName: String?): FileViewerKind {
            val mime = mimeType.orEmpty()
            val name = fileName.orEmpty()
            if (ContactCardFile.isContactCard(mime, name)) return ContactCard
            val bareMime = mime.substringBefore(';').trim().lowercase(Locale.ROOT)
            if (bareMime == PDF_MIME || name.lowercase(Locale.ROOT).endsWith(".pdf")) return Pdf
            return CodeLanguage.detect(name, mime)?.let(::Code) ?: Document
        }
    }
}

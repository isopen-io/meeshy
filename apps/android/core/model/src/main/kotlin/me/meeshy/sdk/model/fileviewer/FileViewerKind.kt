package me.meeshy.sdk.model.fileviewer

import java.util.Locale
import me.meeshy.sdk.model.contacts.vcard.ContactCardFile

/**
 * Où s'ouvre une pièce-fichier du fil : la fiche d'une carte de visite, la visionneuse de code, l'aperçu
 * d'un PDF, le texte brut ou Markdown lu dans l'app, ou la fiche d'un document sans aperçu de page (miroir de l'aiguillage de `BubbleAttachmentView`, iOS).
 */
sealed interface FileViewerKind {
    data object ContactCard : FileViewerKind
    data class Code(val language: CodeLanguage) : FileViewerKind
    data object Pdf : FileViewerKind

    /** Un texte ordinaire ou du Markdown : lu dans l'app (borné, sans rien exécuter), jamais confié à une autre app. */
    data class Text(val isMarkdown: Boolean) : FileViewerKind

    /** Office et autres : aucun aperçu sûr dans l'app ; le fichier s'ouvre avec une autre app, à la demande. */
    data object Document : FileViewerKind

    companion object {
        private const val PDF_MIME = "application/pdf"
        private val markdownExtensions = setOf("md", "markdown", "mdx")
        private val plainTextExtensions = setOf("txt", "text", "log", "csv", "tsv")

        fun of(mimeType: String?, fileName: String?): FileViewerKind {
            val mime = mimeType.orEmpty()
            val name = fileName.orEmpty()
            if (ContactCardFile.isContactCard(mime, name)) return ContactCard
            val bareMime = mime.substringBefore(';').trim().lowercase(Locale.ROOT)
            if (bareMime == PDF_MIME || name.lowercase(Locale.ROOT).endsWith(".pdf")) return Pdf
            textKind(bareMime, name)?.let { return it }
            return CodeLanguage.detect(name, mime)?.let(::Code) ?: Document
        }

        /** Markdown et texte brut, jugés avant le code : un `.md` se LIT, il ne se surligne pas. */
        private fun textKind(bareMime: String, name: String): FileViewerKind? {
            val extension = name.lowercase(Locale.ROOT).substringAfterLast('.', "")
            return when {
                extension in markdownExtensions || bareMime == "text/markdown" || bareMime == "text/x-markdown" -> Text(isMarkdown = true)
                extension in plainTextExtensions -> Text(isMarkdown = false)
                bareMime == "text/plain" && CodeLanguage.detect(name, "") == null -> Text(isMarkdown = false)
                else -> null
            }
        }
    }
}

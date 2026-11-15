package me.meeshy.sdk.model.fileviewer

import java.util.Locale

/**
 * Ce que « Ouvrir avec une autre app » a le droit de prêter (#13496) : un document de bureautique, reconnu à la
 * DERNIÈRE extension de son nom, et annoncé sous le type que cette extension implique. Le type déclaré par
 * l'expéditeur ne choisit jamais le gestionnaire : un fichier se disant Word mais typé `text/html`, `image/svg+xml`
 * ou paquet d'installation ne part pas vers un navigateur ou un installateur. Hors liste (page, script, image
 * vectorielle, archive, exécutable, document à macros) : rien n'est prêté.
 */
object DocumentHandOff {

    private val mimeByExtension = mapOf(
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" to "application/vnd.ms-powerpoint",
        "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odt" to "application/vnd.oasis.opendocument.text",
        "ods" to "application/vnd.oasis.opendocument.spreadsheet",
        "odp" to "application/vnd.oasis.opendocument.presentation",
        "rtf" to "application/rtf",
        "pages" to "application/vnd.apple.pages",
        "numbers" to "application/vnd.apple.numbers",
        "key" to "application/vnd.apple.keynote",
    )

    /** Le type sous lequel prêter [fileName], ou `null` : ce fichier ne quitte pas l'app par « Ouvrir avec ». */
    fun mimeFor(fileName: String?): String? {
        val name = fileName.orEmpty()
        if (!name.contains('.')) return null
        return mimeByExtension[name.substringAfterLast('.').lowercase(Locale.ROOT)]
    }
}

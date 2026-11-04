package me.meeshy.sdk.model.fileviewer

/**
 * Ce que la fiche d'un document laisse faire : un contenu protégé (vue unique, floutée, éphémère, retenue par la loi
 * de sortie) ne s'enregistre pas, ne se partage pas, ne se copie pas, et la fenêtre est exclue des captures.
 */
data class DocumentSheetPolicy(val mayLeave: Boolean, val secureWindow: Boolean) {
    companion object {
        fun of(isProtected: Boolean): DocumentSheetPolicy =
            DocumentSheetPolicy(mayLeave = !isProtected, secureWindow = isProtected)
    }
}

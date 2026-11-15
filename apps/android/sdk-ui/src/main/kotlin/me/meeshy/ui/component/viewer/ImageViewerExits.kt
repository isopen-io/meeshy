package me.meeshy.ui.component.viewer

/** Une sortie du plein écran : ce qui fait quitter Meeshy à un média. */
public enum class ImageViewerExit { Save, Share }

/**
 * La loi de sortie du plein écran — miroir de `mediaExitGate` / `GalleryExitGatedMenu`
 * (`ConversationMediaGalleryView+Menu.swift`, #9573). Une pièce protégée (vue unique,
 * floutée) n'a AUCUNE sortie, donc aucun menu ⋯ ; les autres offrent Enregistrer puis
 * Partager hors de Meeshy, chacun seulement là où l'appareil sait le faire.
 */
public object ImageViewerExits {

    /** Une page sans déclaration peut sortir ; seule une déclaration explicite la retient. */
    public fun isExportable(exportable: List<Boolean>, page: Int): Boolean = exportable.getOrNull(page) ?: true

    public fun offered(isExportable: Boolean, canSave: Boolean, canShare: Boolean): List<ImageViewerExit> {
        if (!isExportable) return emptyList()
        return listOfNotNull(
            ImageViewerExit.Save.takeIf { canSave },
            ImageViewerExit.Share.takeIf { canShare },
        )
    }
}

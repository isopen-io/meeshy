package me.meeshy.sdk.model.composer

/**
 * Ce que le « ⋯ » du composer a le droit d'offrir (miroir de `ComposerOverflowPolicy` iOS, #4996, #13845).
 * « Tout effacer » ferme la liste et ne se sert jamais sur un composer vierge ; l'export n'est servi que s'il y a une scène à baker.
 */
object ComposerOverflowPolicy {

    /** Les entrées servies, dans l'ordre où elles se peignent : l'aperçu en tête, l'export, puis l'unique entrée destructrice. */
    fun entries(
        hasBackground: Boolean,
        hasMedia: Boolean,
        hasText: Boolean,
        hasLocation: Boolean,
        hasScene: Boolean,
        backgroundPickerIsReachable: Boolean = true,
    ): List<ComposerMoreEntry> = buildList {
        if (hasScene) add(ComposerMoreEntry.PREVIEW)
        if (!backgroundPickerIsReachable) add(ComposerMoreEntry.PICK_BACKGROUND)
        if (hasBackground) add(ComposerMoreEntry.REMOVE_BACKGROUND)
        if (hasScene) {
            add(ComposerMoreEntry.SAVE_TO_PHOTOS)
            add(ComposerMoreEntry.SHARE)
        }
        if (hasBackground || hasMedia || hasText || hasLocation || hasScene) add(ComposerMoreEntry.CLEAR_ALL)
    }

    /** Un menu à zéro entrée est un bouton qui n'ouvre rien : le « ⋯ » n'existe que s'il sert au moins une entrée. */
    fun showsMenu(entries: List<ComposerMoreEntry>): Boolean = entries.isNotEmpty()
}

package me.meeshy.sdk.model.composer.scene

/** Les entrées d'export du `⋯` du composer (miroir de `ComposerOverflowEntry` iOS, #4996). */
public enum class ComposerOverflowEntry(public val destination: SceneExportDestination) {
    SAVE_TO_PHOTOS(SceneExportDestination.GALLERY),
    SHARE(SceneExportDestination.SHARE),
}

public object ComposerOverflowEntries {

    /**
     * `hasScene` gouverne les entrées d'export et rien d'autre : sans scène, le pipeline n'a rien à baker et un bake
     * rendrait un MP4 vide (loi 4 : un contrôle qui FAIT quelque chose d'inutile).
     */
    public fun served(hasScene: Boolean): List<ComposerOverflowEntry> =
        if (hasScene) listOf(ComposerOverflowEntry.SAVE_TO_PHOTOS, ComposerOverflowEntry.SHARE) else emptyList()

    /** Une scène se bake dès que la slide peint quelque chose : un objet posé, un fond, un média. */
    public fun hasScene(objects: Int, hasBackground: Boolean, hasMedia: Boolean): Boolean =
        objects > 0 || hasBackground || hasMedia
}

package me.meeshy.sdk.model.composer.edit

/** Les outils du rail à plat d'un fond média que l'application sert, chacun nommé par son identifiant dans l'arbre partagé. */
enum class ComposerBackgroundTool(val entryId: String) {
    FRAMING("framing"), TRIM("trim"), FILTERS("filters"), FRAMES("frames"), ADJUST("adjust"), EFFECTS("effects"),
    SOUND("sound"), LOOP("loop"), ROTATE("rotate"), DESCRIPTION("description"),
}

/**
 * Les outils du fond média (spec 2026-10-31, #13973), posés À PLAT dans son rail avant ses actions — plus de niveau
 * « Modifier » à toucher (#14047, comme iOS #14048) —, lus dans [ComposerEditTree] (`background.media.edit`, que le rail sert
 * à la place de l'entrée « edit » de `background.media`) : l'ordre, le mot et ce qu'ouvre chaque entrée
 * viennent de l'arbre partagé, l'offre de ce que le fond EST. Les outils de l'arbre que cette application ne câble pas
 * encore ([unserved]) ne sont pas offerts (loi 4).
 */
object ComposerBackgroundEditLevel {

    /** [video] : le fond est une vidéo ; [trimmable] : sa durée de source est connue ; [look] : il reçoit les filtres et cadres de l'appel. */
    data class Media(val video: Boolean, val trimmable: Boolean, val look: Boolean) {
        fun allow(offer: ComposerEditTree.Offer): Boolean = when (offer) {
            ComposerEditTree.Offer.ALWAYS -> true
            ComposerEditTree.Offer.IMAGE -> !video
            ComposerEditTree.Offer.VIDEO -> video
            ComposerEditTree.Offer.TRIMMABLE -> video && trimmable
            ComposerEditTree.Offer.LOOK -> look
            ComposerEditTree.Offer.EDITOR, ComposerEditTree.Offer.MEDIA_SOURCE, ComposerEditTree.Offer.CAMERA -> false
        }
    }

    fun tools(media: Media, tree: ComposerEditTree = ComposerEditTree.shared): List<ComposerBackgroundTool> =
        entries(tree).filter { media.allow(it.offer) }.mapNotNull(::toolOf)

    fun entryOf(tool: ComposerBackgroundTool, tree: ComposerEditTree = ComposerEditTree.shared): ComposerEditTree.Entry =
        entries(tree).single { it.id == tool.entryId }

    /** Les outils de l'arbre qu'Android ne sert pas encore : la cible commune, que les lots suivants câbleront. */
    fun unserved(tree: ComposerEditTree = ComposerEditTree.shared): List<String> =
        entries(tree).filter { toolOf(it) == null }.map { it.id }

    private fun entries(tree: ComposerEditTree): List<ComposerEditTree.Entry> =
        tree.level(ComposerEditTree.BACKGROUND_MEDIA_EDIT)?.entries.orEmpty()

    private fun toolOf(entry: ComposerEditTree.Entry): ComposerBackgroundTool? = ComposerBackgroundTool.entries.firstOrNull { it.entryId == entry.id }
}

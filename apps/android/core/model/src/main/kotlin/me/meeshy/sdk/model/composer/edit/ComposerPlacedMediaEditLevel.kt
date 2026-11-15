package me.meeshy.sdk.model.composer.edit

/** Les entrées du « Modifier » d'une image ou d'une vidéo POSÉE que l'application sert, nommées par leur identifiant dans l'arbre partagé. */
enum class ComposerPlacedMediaTool(val entryId: String) {
    CROP("crop"), TRIM("trim"), FILTERS("filters"), FRAMES("frames"), ADJUST("adjust"), EFFECTS("effects"), SOUND("sound"),
    ROTATE("rotate"), DESCRIPTION("description"), SET_AS_BACKGROUND("set-as-background"), REPLACE_BACKGROUND("replace-background"),
    MAKE_STICKER("make-sticker"),
}

/** Ce que le média posé peut faire du fond de la diapo : le devenir, le remplacer, ou rien. */
enum class ComposerPlacedBackgroundOffer { SET, REPLACE, NONE }

/**
 * Le niveau N1 « Modifier » d'une image ou d'une vidéo posée (spec 2026-10-31, #13973, lot A-E4), lu dans [ComposerEditTree]
 * (`media.placed.edit`) : l'ordre, le mot et ce qu'ouvre chaque entrée viennent de l'arbre partagé, l'offre de ce que le média
 * EST. Mettre en fond et Remplacer le fond sont deux entrées dont une seule est servie ; Faire un sticker attend que la
 * découpe soit servie sur l'appareil (loi 4).
 */
object ComposerPlacedMediaEditLevel {

    /** [video] : une vidéo ; [trimmable] : sa durée de source est connue ; [look] : elle reçoit les looks de l'appel ; [sticker] : la découpe est servie. */
    data class Media(
        val video: Boolean,
        val trimmable: Boolean,
        val look: Boolean,
        val background: ComposerPlacedBackgroundOffer,
        val sticker: Boolean,
    ) {
        fun allow(entry: ComposerEditTree.Entry): Boolean = when (entry.id) {
            ComposerPlacedMediaTool.SET_AS_BACKGROUND.entryId -> background == ComposerPlacedBackgroundOffer.SET
            ComposerPlacedMediaTool.REPLACE_BACKGROUND.entryId -> background == ComposerPlacedBackgroundOffer.REPLACE
            ComposerPlacedMediaTool.MAKE_STICKER.entryId -> sticker && allow(entry.offer)
            else -> allow(entry.offer)
        }

        private fun allow(offer: ComposerEditTree.Offer): Boolean = when (offer) {
            ComposerEditTree.Offer.ALWAYS -> true
            ComposerEditTree.Offer.IMAGE -> !video
            ComposerEditTree.Offer.VIDEO -> video
            ComposerEditTree.Offer.TRIMMABLE -> video && trimmable
            ComposerEditTree.Offer.LOOK -> look
            ComposerEditTree.Offer.EDITOR, ComposerEditTree.Offer.MEDIA_SOURCE, ComposerEditTree.Offer.CAMERA -> false
        }
    }

    fun tools(media: Media, tree: ComposerEditTree = ComposerEditTree.shared): List<ComposerPlacedMediaTool> =
        entries(tree).filter(media::allow).mapNotNull { entry -> ComposerPlacedMediaTool.entries.firstOrNull { it.entryId == entry.id } }

    fun entryOf(tool: ComposerPlacedMediaTool, tree: ComposerEditTree = ComposerEditTree.shared): ComposerEditTree.Entry =
        entries(tree).single { it.id == tool.entryId }

    private fun entries(tree: ComposerEditTree): List<ComposerEditTree.Entry> = tree.level(ComposerEditTree.MEDIA_PLACED_EDIT)?.entries.orEmpty()
}

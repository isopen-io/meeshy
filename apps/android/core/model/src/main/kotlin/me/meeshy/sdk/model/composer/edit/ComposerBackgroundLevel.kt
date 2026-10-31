package me.meeshy.sdk.model.composer.edit

/**
 * Les actions qui suivent les outils dans le rail à plat d'un fond image ou vidéo (#14047), chacune nommée par son
 * identifiant dans l'arbre partagé ; l'entrée « edit » de `background.media` n'en est pas une : ses outils sont posés à plat.
 */
enum class ComposerBackgroundAction(val entryId: String) {
    REPLACE("replace"), PUT_ON_SCENE("put-on-scene"), REMOVE("remove"),
}

/** Les sources de « Remplacer » : la photothèque, l'appareil photo de la scène, les fichiers. */
enum class ComposerBackgroundSource(val entryId: String) {
    LIBRARY("library"), CAMERA("camera"), FILES("files"),
}

/**
 * Les actions du rail « Fond » d'un fond média (spec 2026-10-31, #13973, à plat depuis #14047 : elles suivent ses outils,
 * [ComposerBackgroundEditLevel]) et la feuille de ses sources, lus dans [ComposerEditTree] : l'ordre et la destruction
 * viennent de l'arbre partagé, l'offre de ce que la surface a sous la main.
 */
object ComposerBackgroundLevel {

    /** [mediaSource] : la photothèque et les fichiers s'ouvrent ; [camera] : la scène filme. */
    data class Offers(val mediaSource: Boolean, val camera: Boolean) {
        fun allow(offer: ComposerEditTree.Offer): Boolean = when (offer) {
            ComposerEditTree.Offer.ALWAYS -> true
            ComposerEditTree.Offer.EDITOR -> false
            ComposerEditTree.Offer.MEDIA_SOURCE -> mediaSource || camera
            ComposerEditTree.Offer.CAMERA -> camera
            ComposerEditTree.Offer.IMAGE, ComposerEditTree.Offer.VIDEO, ComposerEditTree.Offer.TRIMMABLE, ComposerEditTree.Offer.LOOK -> false
        }
    }

    fun actions(offers: Offers, tree: ComposerEditTree = ComposerEditTree.shared): List<ComposerBackgroundAction> =
        served(tree, ComposerEditTree.BACKGROUND_MEDIA, ComposerBackgroundAction.entries, ComposerBackgroundAction::entryId) { entry ->
            offers.allow(entry.offer)
        }

    fun sources(offers: Offers, tree: ComposerEditTree = ComposerEditTree.shared): List<ComposerBackgroundSource> =
        served(tree, ComposerEditTree.BACKGROUND_MEDIA_REPLACE, ComposerBackgroundSource.entries, ComposerBackgroundSource::entryId) { entry ->
            if (entry.offer == ComposerEditTree.Offer.MEDIA_SOURCE) offers.mediaSource else offers.allow(entry.offer)
        }

    fun entryOf(action: ComposerBackgroundAction, tree: ComposerEditTree = ComposerEditTree.shared): ComposerEditTree.Entry =
        tree.level(ComposerEditTree.BACKGROUND_MEDIA)!!.entries.single { it.id == action.entryId }

    fun entryOf(source: ComposerBackgroundSource, tree: ComposerEditTree = ComposerEditTree.shared): ComposerEditTree.Entry =
        tree.level(ComposerEditTree.BACKGROUND_MEDIA_REPLACE)!!.entries.single { it.id == source.entryId }

    private fun <T> served(
        tree: ComposerEditTree,
        levelId: String,
        known: List<T>,
        idOf: (T) -> String,
        offered: (ComposerEditTree.Entry) -> Boolean,
    ): List<T> = tree.level(levelId)?.entries.orEmpty()
        .filter(offered)
        .mapNotNull { entry -> known.firstOrNull { idOf(it) == entry.id } }
}

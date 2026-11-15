package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryLocationObject

/** Un calque de la scène lue : l'un des trois genres d'objets que l'auteur a posés et dont le `zIndex` ordonne la peinture. */
internal sealed interface StorySceneLayer {
    val id: String
    val zIndex: Int

    /** La clé de composition : un texte et un sticker peuvent porter le même identifiant. */
    val key: String

    data class Text(val view: StoryTextObjectView) : StorySceneLayer {
        override val id: String get() = view.id
        override val zIndex: Int get() = view.zIndex
        override val key: String get() = "text:$id"
    }

    data class Media(val view: StoryForegroundMediaView) : StorySceneLayer {
        override val id: String get() = view.id
        override val zIndex: Int get() = view.zIndex
        override val key: String get() = "media:$id"
    }

    data class Sticker(val view: StoryStickerView) : StorySceneLayer {
        override val id: String get() = view.id
        override val zIndex: Int get() = view.zIndex
        override val key: String get() = "sticker:$id"
    }

    /** Une pastille de lieu (#13846, iOS `StoryLocationLayer`). */
    data class Place(val view: StoryLocationObject) : StorySceneLayer {
        override val id: String get() = view.id
        override val zIndex: Int get() = view.zIndex
        override val key: String get() = "place:$id"
    }

    /** La pastille d'un son posé sur la scène (#13852) : à son rang dans la pile, au-dessus de tout quand elle n'en a pas. */
    data class Audio(val view: StoryAudioChipView) : StorySceneLayer {
        override val id: String get() = view.id
        override val zIndex: Int get() = view.zIndex
        override val key: String get() = "audio:$id"
    }
}

/**
 * L'ordre de peinture de la scène, celui d'iOS (`StoryRenderer.render` : `collectItems(...).sorted(by: zIndex)`) : UN tri
 * stable par `zIndex` sur tous les objets, et à égalité l'ordre de collecte — textes, puis médias, puis stickers, puis
 * lieux, puis les pastilles de son. Le compositeur range ces cinq familles sur une seule pile (#13852, [StorySceneStack]) :
 * le lecteur peint cette pile. Une pastille sans rang reste au-dessus de tout, comme la couche audio d'iOS.
 */
internal object StorySceneLayerOrder {

    fun order(slide: StorySlideView): List<StorySceneLayer> =
        (
            slide.textObjects.map(StorySceneLayer::Text) +
                slide.foregroundMedia.map(StorySceneLayer::Media) +
                slide.stickers.map(StorySceneLayer::Sticker) +
                slide.places.map(StorySceneLayer::Place) +
                slide.audioChips.map(StorySceneLayer::Audio)
            ).sortedBy { it.zIndex }
}

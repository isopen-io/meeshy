package me.meeshy.app.stories

import me.meeshy.sdk.model.composer.ComposerObjectKind

/**
 * Clone [sourceId] as [newId], offset by ([dx], [dy]) and rangé juste après sa source. Inert (même
 * instance) quand la source est inconnue, que [newId] existe déjà ou que la slide est au plafond.
 */
fun StorySlideDeck.duplicateSticker(sourceId: String, newId: String, dx: Float, dy: Float): StorySlideDeck {
    if (slides.any { slide -> slide.stickers.any { it.id == newId } }) return this
    val slideIndex = slides.indexOfFirst { slide -> slide.stickers.any { it.id == sourceId } }
    if (slideIndex < 0) return this
    val slide = slides[slideIndex]
    if (slide.stickers.size >= StorySlideDeck.MAX_STICKERS_PER_SLIDE) return this
    val sourceIndex = slide.stickers.indexOfFirst { it.id == sourceId }
    val clone = slide.stickers[sourceIndex].copy(id = newId).nudged(dx, dy)
    val stickers = slide.stickers.toMutableList().apply { add(sourceIndex + 1, clone) }
    return copy(slides = slides.mapIndexed { i, s -> if (i == slideIndex) s.copy(stickers = stickers) else s })
}

/** Restack le sticker [id] sur la pile UNIQUE des objets de sa scène ([StorySceneStack], #13852) ; inerte quand rien ne change. */
fun StorySlideDeck.reorderSticker(id: String, op: StoryZOrder): StorySlideDeck =
    restacked(SceneObjectRef(ComposerObjectKind.STICKER, id), op)

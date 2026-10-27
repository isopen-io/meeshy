package me.meeshy.app.stories

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

/**
 * Restack le sticker [id] dans l'ordre de peinture de sa slide (index 0 = fond, dernier = devant).
 * Inert quand l'id est inconnu ou que le geste ne changerait rien.
 */
fun StorySlideDeck.reorderSticker(id: String, op: StoryZOrder): StorySlideDeck {
    val slideIndex = slides.indexOfFirst { slide -> slide.stickers.any { it.id == id } }
    if (slideIndex < 0) return this
    val stickers = slides[slideIndex].stickers
    val from = stickers.indexOfFirst { it.id == id }
    val target = when (op) {
        StoryZOrder.TO_BACK -> 0
        StoryZOrder.BACKWARD -> from - 1
        StoryZOrder.FORWARD -> from + 1
        StoryZOrder.TO_FRONT -> stickers.lastIndex
    }.coerceIn(0, stickers.lastIndex)
    if (target == from) return this
    val restacked = stickers.toMutableList().apply { add(target, removeAt(from)) }
    return copy(slides = slides.mapIndexed { i, s -> if (i == slideIndex) s.copy(stickers = restacked) else s })
}

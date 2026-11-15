package me.meeshy.app.stories

/** Le FICHIER que nomme l'objet [id] : celui d'un média posé (la copie nomme celui de sa source, #13902), sinon [id] lui-même — un média non posé, le fond. */
internal fun StorySlide.mediaFileOf(id: String): String = placedMedia.firstOrNull { it.id == id }?.mediaId ?: id

/** [id] désigne un objet de la slide : un de ses médias, ou un média posé (une copie n'est pas un média de la slide). */
internal fun StorySlide.holdsMediaObject(id: String): Boolean = id in mediaIds || placedMedia.any { it.id == id }

/** Réécrit les médias posés de la slide [slideId] ; les autres slides et la sélection sont intacts. */
internal fun StorySlideDeck.updatePlacedMedia(slideId: String, change: (List<StoryPlacedMedia>) -> List<StoryPlacedMedia>): StorySlideDeck =
    updatePlacedMediaWhere({ it.id == slideId }, change)

internal fun StorySlideDeck.updatePlacedMediaWhere(
    matches: (StorySlide) -> Boolean,
    change: (List<StoryPlacedMedia>) -> List<StoryPlacedMedia>,
): StorySlideDeck = copy(slides = slides.map { if (matches(it)) it.copy(placedMedia = change(it.placedMedia)) else it })

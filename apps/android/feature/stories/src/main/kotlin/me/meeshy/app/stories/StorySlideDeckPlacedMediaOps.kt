package me.meeshy.app.stories

/** Réécrit les médias posés de la slide [slideId] ; les autres slides et la sélection sont intacts. */
internal fun StorySlideDeck.updatePlacedMedia(slideId: String, change: (List<StoryPlacedMedia>) -> List<StoryPlacedMedia>): StorySlideDeck =
    updatePlacedMediaWhere({ it.id == slideId }, change)

internal fun StorySlideDeck.updatePlacedMediaWhere(
    matches: (StorySlide) -> Boolean,
    change: (List<StoryPlacedMedia>) -> List<StoryPlacedMedia>,
): StorySlideDeck = copy(slides = slides.map { if (matches(it)) it.copy(placedMedia = change(it.placedMedia)) else it })

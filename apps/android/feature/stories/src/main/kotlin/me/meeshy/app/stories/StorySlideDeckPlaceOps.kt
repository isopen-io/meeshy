package me.meeshy.app.stories

import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.composer.StoryLimits

/** La slide sélectionnée peut porter une pastille de lieu de plus (cinquante par scène, comme toute famille d'objets). */
val StorySlideDeck.selectedCanAddPlace: Boolean get() = selectedSlide.places.size < StoryLimits.OBJECTS_PER_FAMILY

/** Pose [place] sur la slide sélectionnée ; inerte au plafond ou sur un identifiant déjà posé. */
fun StorySlideDeck.addPlaceToSelected(place: StoryLocationObject): StorySlideDeck {
    if (!selectedCanAddPlace || slides.any { slide -> slide.places.any { it.id == place.id } }) return this
    val index = selectedIndex
    return copy(slides = slides.mapIndexed { i, slide -> if (i == index) slide.copy(places = slide.places + place.copy(zIndex = StorySceneStack.nextZ(slide))) else slide })
}

/** Réécrit la pastille [id] où qu'elle soit ; sa position reste dans la scène. */
fun StorySlideDeck.updatePlace(id: String, transform: (StoryLocationObject) -> StoryLocationObject): StorySlideDeck {
    if (slides.none { slide -> slide.places.any { it.id == id } }) return this
    return copy(
        slides = slides.map { slide ->
            if (slide.places.none { it.id == id }) slide
            else slide.copy(
                places = slide.places.map { place ->
                    if (place.id != id) place
                    else transform(place).let { it.copy(x = it.x.coerceIn(0.0, 1.0), y = it.y.coerceIn(0.0, 1.0)) }
                },
            )
        },
    )
}

fun StorySlideDeck.removePlace(id: String): StorySlideDeck {
    if (slides.none { slide -> slide.places.any { it.id == id } }) return this
    return copy(slides = slides.map { slide -> slide.copy(places = slide.places.filterNot { it.id == id }) })
}

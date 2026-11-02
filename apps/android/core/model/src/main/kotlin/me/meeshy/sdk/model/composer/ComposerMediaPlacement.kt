package me.meeshy.sdk.model.composer

/** Ce qu'un média visuel devient en entrant dans la scène (miroir de `ComposerMediaRole`, iOS) : le fond de sa diapo, ou un objet posé dessus. */
enum class ComposerMediaRole { BACKGROUND, FOREGROUND }

/**
 * Où se pose chaque média d'un choix (R4 de #13863, miroir de `ComposerMediaPlacement` et `ComposerScenePicking`, iOS) :
 * un média seul devient le fond d'une diapo qui n'en a pas, et se pose en premier plan, SUR la scène, sur une diapo qui en a
 * un ; plusieurs médias choisis ensemble fondent chacun leur diapo, le premier remplissant la courante si elle n'a pas de
 * fond. Au plafond des diapos, la série s'arrête : ce qui ne trouve pas de diapo est refusé, jamais posé en douce sur la
 * dernière.
 */
object ComposerMediaPlacement {

    /** La place d'un média : son rôle, et s'il fonde une diapo neuve ou rejoint la courante. */
    data class Landing(val role: ComposerMediaRole, val newSlide: Boolean)

    /**
     * Les places des [count] médias choisis, dans leur ordre ; plus courte que [count] quand [freeSlides] ne suffit pas.
     * [asBackground] (« ⋯ › Choisir un fond ») : le premier devient le fond de la diapo courante, qu'elle en ait un ou non.
     */
    fun plan(count: Int, slideHasBackground: Boolean, freeSlides: Int, asBackground: Boolean = false): List<Landing> {
        if (count <= 0) return emptyList()
        val fillsCurrent = asBackground || !slideHasBackground
        if (count == 1 || (!fillsCurrent && freeSlides <= 0)) return listOf(single(fillsCurrent))
        val first = if (fillsCurrent) CURRENT_BACKGROUND else NEW_SLIDE
        val slidesLeft = (freeSlides - if (fillsCurrent) 0 else 1).coerceAtLeast(0)
        return listOf(first) + List(minOf(count - 1, slidesLeft)) { NEW_SLIDE }
    }

    private fun single(fillsCurrent: Boolean): Landing =
        if (fillsCurrent) CURRENT_BACKGROUND else Landing(ComposerMediaRole.FOREGROUND, newSlide = false)

    private val CURRENT_BACKGROUND = Landing(ComposerMediaRole.BACKGROUND, newSlide = false)
    private val NEW_SLIDE = Landing(ComposerMediaRole.BACKGROUND, newSlide = true)
}

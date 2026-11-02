package me.meeshy.sdk.model.call.group

/** Ce que la scène d'un appel de groupe montre : la grille, ou une vignette « à la une » — iOS `GroupCallStageFocus`. */
sealed interface GroupCallStageFocus {
    data object Grid : GroupCallStageFocus

    data class Spotlight(val tileId: String, val isScreenShare: Boolean) : GroupCallStageFocus
}

/** Le choix LOCAL de l'utilisateur, jamais partagé avec les autres membres — iOS `GroupCallSpotlightChoice`. */
sealed interface GroupCallSpotlightChoice {
    /** « Revenir à la grille », même pendant un partage d'écran. */
    data object Grid : GroupCallSpotlightChoice

    /** Une vignette touchée. */
    data class Tile(val id: String) : GroupCallSpotlightChoice
}

/** Où se range la pellicule des autres vignettes quand l'une est à la une. */
enum class GroupCallFilmstrip {
    /** Plein écran : la vignette à la une seule. */
    None,

    /** Portrait : une rangée horizontale sous la vignette à la une. */
    Bottom,

    /** Paysage : une colonne verticale à droite de la vignette à la une. */
    Trailing,
}

/**
 * La règle de mise à la une, pure — iOS `GroupCallSpotlight` : le choix manuel l'emporte ; sans choix (ou si la
 * vignette choisie a quitté l'appel), un partage d'écran d'un membre monte seul à la une ; sinon, la grille.
 */
object GroupCallSpotlight {
    const val MAX_ZOOM: Float = 4f

    fun focus(tiles: List<GroupCallStageTile>, choice: GroupCallSpotlightChoice?): GroupCallStageFocus = when (choice) {
        GroupCallSpotlightChoice.Grid -> GroupCallStageFocus.Grid
        is GroupCallSpotlightChoice.Tile -> tiles.firstOrNull { it.id == choice.id }
            ?.let { GroupCallStageFocus.Spotlight(it.id, it.isScreenSharing) }
            ?: automaticFocus(tiles)
        null -> automaticFocus(tiles)
    }

    /**
     * Le membre dont l'écran monte seul à la une : le premier arrivé qui partage. Ma vignette n'y prétend jamais —
     * mon propre partage se voit par sa bannière, pas en me regardant moi-même.
     */
    fun sharerId(tiles: List<GroupCallStageTile>): String? = tiles.firstOrNull { !it.isLocal && it.isScreenSharing }?.id

    /**
     * Un « Grille » posé pendant un partage ne vaut que pour CE partage : un nouveau partage, ou sa fin, rend la main
     * à la règle automatique. Une vignette épinglée, elle, reste épinglée.
     */
    fun choiceAfterSharerChanged(
        choice: GroupCallSpotlightChoice?,
        oldSharer: String?,
        newSharer: String?,
    ): GroupCallSpotlightChoice? = if (oldSharer != newSharer && choice == GroupCallSpotlightChoice.Grid) null else choice

    /** `true` quand MA vignette est à la une : mon image occupe la scène. */
    fun featuresLocal(focus: GroupCallStageFocus): Boolean =
        focus is GroupCallStageFocus.Spotlight && focus.tileId == GroupCallStageLaw.LOCAL_TILE_ID

    /** Le zoom d'un écran partagé : jamais sous 1, jamais au-delà de [MAX_ZOOM]. */
    fun clampedZoom(scale: Float): Float = scale.coerceIn(1f, MAX_ZOOM)

    /** La pellicule des autres : aucune en plein écran, en colonne à droite en paysage, en rangée dessous sinon. */
    fun filmstrip(isFullScreen: Boolean, isLandscape: Boolean): GroupCallFilmstrip = when {
        isFullScreen -> GroupCallFilmstrip.None
        isLandscape -> GroupCallFilmstrip.Trailing
        else -> GroupCallFilmstrip.Bottom
    }

    private fun automaticFocus(tiles: List<GroupCallStageTile>): GroupCallStageFocus =
        sharerId(tiles)?.let { GroupCallStageFocus.Spotlight(it, isScreenShare = true) } ?: GroupCallStageFocus.Grid
}

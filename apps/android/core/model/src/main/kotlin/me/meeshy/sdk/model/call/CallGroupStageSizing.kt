package me.meeshy.sdk.model.call

/** A row of the control block: the family it titles, or `null` when families fold into one line. */
data class CallPillRowContent(val family: CallActionFamily?, val actions: List<CallAction>) {
    val id: String get() = family?.name ?: "folded"
}

/** In compact height the captioned rows fold into ONE untitled scrolling line. */
object CallGroupStageSizing {
    const val COMPACT_HEIGHT_THRESHOLD_DP: Float = 500f
    const val MINIMUM_GRID_HEIGHT_DP: Float = 140f

    /** The unfolded rows scroll past this height. */
    const val MAXIMUM_ROWS_HEIGHT_DP: Float = 340f

    /** The rows never give up their last line, so the grid yields only down to this point. */
    const val MINIMUM_ROWS_HEIGHT_DP: Float = 96f

    /**
     * How tall the unfolded rows may be so that the grid keeps [MINIMUM_GRID_HEIGHT_DP] (iOS `.frame(minHeight:)`):
     * what the stage holds besides the rows and the grid is [reservedDp]. The rows scroll within this height.
     */
    fun rowsCeilingDp(stageHeightDp: Float, reservedDp: Float): Float =
        (stageHeightDp - reservedDp - MINIMUM_GRID_HEIGHT_DP).coerceIn(MINIMUM_ROWS_HEIGHT_DP, MAXIMUM_ROWS_HEIGHT_DP)

    fun isCompactHeight(stageHeightDp: Float): Boolean =
        stageHeightDp > 0f && stageHeightDp < COMPACT_HEIGHT_THRESHOLD_DP

    /** La rangée de l'en-tête et son écart, depuis le haut de la zone sûre : là où commençait la grille avant P11.1. */
    const val HEADER_BAND_DP: Float = 52f

    /** P11.1 — l'écart de la grille au haut de la zone sûre quand l'en-tête flotte sur elle : celui de deux vignettes. */
    const val FLOATING_GRID_TOP_DP: Float = 8f

    /**
     * P11.1 · L4.2 — la place que la grille de groupe laisse au-dessus d'elle, depuis le haut de la zone sûre. Quand la hauteur
     * suffit (le portrait), la grille prend l'écran et l'en-tête flotte sur sa première rangée ; en hauteur compacte, elle
     * reste ENTRE l'en-tête et la pilule, aucune plaque sous l'en-tête.
     */
    fun gridTopBaseDp(isCompactHeight: Boolean): Float = if (isCompactHeight) HEADER_BAND_DP else FLOATING_GRID_TOP_DP

    /**
     * L4.11 — ce que la pile des bandeaux ([stackDp], déjà mesurée) ajoute à [gridTopBaseDp] : la pile se pose SOUS l'en-tête,
     * si bien qu'une grille qui flottait redescend d'abord sous sa rangée, puis sous la pile. Une seule valeur, animée d'un
     * seul geste : la grille glisse sans saut de sa place flottante à sa place sous la pile.
     */
    fun gridBannerClearanceDp(isCompactHeight: Boolean, stackDp: Float): Float =
        if (stackDp <= 0f) 0f else stackDp + HEADER_BAND_DP - gridTopBaseDp(isCompactHeight)

    /**
     * P14 · U1 — ce que l'en-tête couvre encore du haut de la scène, la part de pile montrée ([bannerClearanceDp]) comprise :
     * la capsule de la une et la puce d'un écran s'y tiennent dessous. Jamais négatif.
     */
    fun headerOverlapDp(isCompactHeight: Boolean, bannerClearanceDp: Float): Float =
        (HEADER_BAND_DP - gridTopBaseDp(isCompactHeight) - bannerClearanceDp).coerceAtLeast(0f)

    fun rows(families: List<CallActionFamilyRow>, isCompactHeight: Boolean): List<CallPillRowContent> {
        if (!isCompactHeight) return families.map { CallPillRowContent(it.family, it.actions) }
        val actions = families.flatMap { it.actions }
        return if (actions.isEmpty()) emptyList() else listOf(CallPillRowContent(null, actions))
    }
}

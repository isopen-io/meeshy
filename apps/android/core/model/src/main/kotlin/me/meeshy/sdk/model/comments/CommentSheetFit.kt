package me.meeshy.sdk.model.comments

/**
 * Le composeur ne passe jamais sous l'en-tête de la feuille (iOS `CommentSheetFit`, #9736). La règle se lit sur une
 * SONDE : dès que le haut du composeur dépasse le haut de la zone de contenu, la feuille passe à sa grande détente.
 */
object CommentSheetFit {
    enum class Detent { MEDIUM, LARGE }

    /** La tolérance d'arrondi d'une mise en page. */
    const val TOLERANCE: Float = 0.5f

    /** Une rangée de vignettes reste atteignable ; en dessous, la feuille grandit. */
    const val PANEL_FLOOR_DP: Float = 96f

    /** `composerTop` : haut du composeur dans la zone de contenu (origine = bas de l'en-tête). Non fini ⇒ ne prouve rien. */
    fun overflows(composerTop: Float): Boolean = composerTop.isFinite() && composerTop < -TOLERANCE

    /** La grande dès que le composeur déborde, sinon celle qu'elle a : elle ne se réduit jamais d'elle-même. */
    fun detent(composerTop: Float, current: Detent): Detent = if (overflows(composerTop)) Detent.LARGE else current

    /** Le panneau cède de la hauteur à l'hôte compté (une feuille) jusqu'au plancher ; sinon il garde celle du clavier. */
    fun panelHeightDp(restingDp: Float, availableDp: Float, yields: Boolean): Float =
        if (!yields) restingDp else availableDp.coerceIn(minOf(PANEL_FLOOR_DP, restingDp), restingDp)
}

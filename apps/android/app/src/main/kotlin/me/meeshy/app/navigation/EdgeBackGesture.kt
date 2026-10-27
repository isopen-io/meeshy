package me.meeshy.app.navigation

/**
 * Les règles du retour interactif depuis le bord (#13364), pures : le glissé iOS du bord gauche, qui sur Android 9
 * n'a aucun équivalent système. Le détecteur ([EdgeSwipeBackHost]) ne fait que les appliquer.
 */
internal object EdgeBackGesture {
    /** La zone qui arme le geste : 20 dp collés au bord de début (le bord droit en RTL). */
    const val EDGE_DP: Float = 20f

    /** Au-delà du tiers de la largeur, le retour est validé. */
    const val COMMIT_FRACTION: Float = 1f / 3f

    /** Un lancer franc valide aussi : deux largeurs d'écran par seconde. */
    const val COMMIT_VELOCITY_WIDTHS_PER_SECOND: Float = 2f

    /** En dessous, un lancer n'est qu'un effleurement. */
    const val MIN_PROGRESS_FOR_FLING: Float = 0.04f

    fun beginsAtEdge(x: Float, widthPx: Float, edgePx: Float, isRtl: Boolean): Boolean =
        if (isRtl) x >= widthPx - edgePx else x <= edgePx

    /** Le déplacement vers l'intérieur de l'écran, signé par la direction de lecture : positif = on referme. */
    fun travel(startX: Float, currentX: Float, isRtl: Boolean): Float =
        if (isRtl) startX - currentX else currentX - startX

    fun progress(travelPx: Float, widthPx: Float): Float =
        if (widthPx <= 0f) 0f else (travelPx / widthPx).coerceIn(0f, 1f)

    fun shouldCommit(progress: Float, velocityWidthsPerSecond: Float): Boolean =
        progress >= COMMIT_FRACTION ||
            (progress >= MIN_PROGRESS_FOR_FLING && velocityWidthsPerSecond >= COMMIT_VELOCITY_WIDTHS_PER_SECOND)

    /** Un geste qui part en travers (plus vertical qu'horizontal, ou vers l'extérieur) n'est pas un retour. */
    fun isForeign(travelPx: Float, verticalPx: Float, slopPx: Float): Boolean =
        travelPx < -slopPx || (verticalPx > slopPx && verticalPx > kotlin.math.abs(travelPx))

    fun hasStarted(travelPx: Float, slopPx: Float): Boolean = travelPx > slopPx
}

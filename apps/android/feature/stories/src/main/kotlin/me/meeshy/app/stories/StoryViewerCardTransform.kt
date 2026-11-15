package me.meeshy.app.stories

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Le cadre sous lequel la carte du lecteur se montre : apparition, glissé de fermeture, sortie
 * (iOS `StoryViewerCardTransform`). Fonction PURE des valeurs d'animation que le lecteur écrit ;
 * elle ne possède aucun état. Le Composable ne fait que la lire en phase de dessin.
 *
 * [appear] : 0 = carte fermée (échelle 0,92, coin 24 dp), 1 = plein écran. [dragProgress] : p = dy / 350.
 */
internal object StoryViewerCardTransform {
    const val APPEAR_SCALE = 0.92f
    const val APPEAR_CORNER_DP = 24f
    const val DISMISSING_SCALE = 0.12f
    const val EXIT_TRAVEL_FRACTION = 0.35f

    /** Fondu du son à la fermeture (iOS : coupure du moteur audio au départ de la carte). */
    const val AUDIO_FADE_MS = 400

    /** Ressort d'apparition : réponse 0,4 s, amorti 0,82 (iOS `viewerDidAppear`). */
    const val APPEAR_RESPONSE_SECONDS = 0.4f
    const val APPEAR_DAMPING = 0.82f

    data class Frame(val scale: Float, val cornerDp: Float, val alpha: Float, val offsetY: Float)

    fun frame(appear: Float, dragY: Float, dismissal: Float, screenHeight: Float, travelPx: Float): Frame {
        val p = StoryCubeTransform.dismissProgress(dragY, travelPx)
        val a = appear.coerceIn(0f, 1f)
        val appearScale = APPEAR_SCALE + (1f - APPEAR_SCALE) * a
        val appearCorner = APPEAR_CORNER_DP * (1f - a)
        val leaving = dismissal.coerceIn(0f, 1f)
        val restScale = appearScale * StoryCubeTransform.dismissScale(p)
        val restCorner = maxOf(appearCorner, p * StoryCubeTransform.DISMISS_CORNER_DP)
        return Frame(
            scale = lerp(restScale, DISMISSING_SCALE, leaving),
            cornerDp = lerp(restCorner, StoryCubeTransform.DISMISSING_CORNER_DP, leaving),
            alpha = lerp(StoryCubeTransform.dismissAlpha(p), 0f, leaving).coerceIn(0f, 1f),
            offsetY = lerp(dragY, screenHeight * EXIT_TRAVEL_FRACTION, leaving),
        )
    }

    /** Gain du son : plein tant que la carte reste, fondu linéaire jusqu'à 0 pendant la sortie. */
    fun audioGain(dismissal: Float): Float = (1f - dismissal.coerceIn(0f, 1f)).coerceIn(0f, 1f)

    private fun lerp(start: Float, stop: Float, fraction: Float): Float = start + (stop - start) * fraction
}

/** Le gain de fondu que la coque fournit aux pistes sonores de la scène ; 1 hors du lecteur. */
internal val LocalStoryAudioGain = staticCompositionLocalOf<() -> Float> { { 1f } }

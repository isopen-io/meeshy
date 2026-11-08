package me.meeshy.app.stories

import kotlin.math.abs

/**
 * Décide si un glissement sur la bannière de publication en attente l'écarte (iOS `PendingBannerDismissResolver`) : vers le
 * haut, la gauche ou la droite — les trois directions qu'on essaie naturellement — au-delà de [DEFAULT_THRESHOLD_DP] ; vers le
 * bas, rien (réservé : un glissé descendant dans la bannière ne fait rien de surprenant).
 */
internal object PendingBannerDismissResolver {
    const val DEFAULT_THRESHOLD_DP: Float = 24f

    /** [dxDp] et [dyDp] : le déplacement du doigt en dp, le haut étant négatif. */
    fun shouldDismiss(dxDp: Float, dyDp: Float, thresholdDp: Float = DEFAULT_THRESHOLD_DP): Boolean =
        abs(dxDp) > thresholdDp || dyDp < -thresholdDp

    /** Le décalage que la bannière suit pendant le geste : le doigt, sans jamais descendre sous sa place (le bas est réservé). */
    fun followOffsetDp(dxDp: Float, dyDp: Float): Pair<Float, Float> = dxDp to dyDp.coerceAtMost(0f)

    /** L'opacité qui s'efface avec la distance parcourue : pleine au repos, nulle au double du seuil. */
    fun fadeAlpha(dxDp: Float, dyDp: Float, thresholdDp: Float = DEFAULT_THRESHOLD_DP): Float {
        val travelled = maxOf(abs(dxDp), -dyDp.coerceAtMost(0f))
        return (1f - travelled / (thresholdDp * 2f)).coerceIn(0f, 1f)
    }
}

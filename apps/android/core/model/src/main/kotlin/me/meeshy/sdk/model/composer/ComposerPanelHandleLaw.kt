package me.meeshy.sdk.model.composer

import kotlin.math.max
import kotlin.math.min

/** Issue d'un geste vertical relâché sur la poignée du panneau de pièces — miroir d'iOS `ComposerPanelHandleOutcome`. */
enum class ComposerPanelHandleOutcome { OPEN_FULL_LIBRARY, CLOSE_PANEL, IGNORE }

/**
 * Loi de la poignée du panneau de pièces — miroir d'iOS `ComposerPanelHandleLaw`.
 * Seuil de position OU course projetée (comptée double), chaque sens exigeant le signe strict de la
 * translation : les deux plages sont disjointes par construction. Négatif = vers le haut.
 */
object ComposerPanelHandleLaw {
    const val OPEN_THRESHOLD_DP: Float = -44f
    const val CLOSE_THRESHOLD_DP: Float = 44f
    private const val PREDICTION_FACTOR: Float = 2f

    fun outcome(translationDp: Float, predictedDp: Float): ComposerPanelHandleOutcome = when {
        translationDp <= OPEN_THRESHOLD_DP ||
            (predictedDp <= OPEN_THRESHOLD_DP * PREDICTION_FACTOR && translationDp < 0f) ->
            ComposerPanelHandleOutcome.OPEN_FULL_LIBRARY
        translationDp >= CLOSE_THRESHOLD_DP ||
            (predictedDp >= CLOSE_THRESHOLD_DP * PREDICTION_FACTOR && translationDp > 0f) ->
            ComposerPanelHandleOutcome.CLOSE_PANEL
        else -> ComposerPanelHandleOutcome.IGNORE
    }
}

/** Passage de relais du panneau vers la photothèque complète — miroir d'iOS `ComposerLibraryHandoff`. */
object ComposerLibraryHandoff {
    const val EXPAND_DELAY_MS: Long = 200L
    const val EXPAND_LIFT_DP: Float = 140f
    const val MAX_HEIGHT_RATIO: Float = 0.72f

    /** Jamais sous la hauteur au repos : l'étirement ne se retourne pas en rétrécissement. */
    fun expandedHeight(restingDp: Float, windowHeightDp: Float): Float =
        max(restingDp, min(restingDp + EXPAND_LIFT_DP, windowHeightDp * MAX_HEIGHT_RATIO))
}

/** Cascade d'apparition des tuiles du carrousel : 0,04 s par rang, aucune en mouvement réduit. */
object ComposerTileCascade {
    const val STEP_MS: Int = 40

    fun delayMs(index: Int, reduceMotion: Boolean): Int =
        if (reduceMotion) 0 else STEP_MS * index.coerceAtLeast(0)
}

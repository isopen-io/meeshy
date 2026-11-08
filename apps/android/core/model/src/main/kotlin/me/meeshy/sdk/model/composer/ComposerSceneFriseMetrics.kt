package me.meeshy.sdk.model.composer

import kotlin.math.roundToInt

/**
 * Les mesures de la frise de la scène animée (miroir de `ComposerSceneFriseMetrics` iOS) : la colonne des noms,
 * la cible d'une poignée, le pas du lecteur d'écran et les libellés « 1.2 s / 6 s » et « 1 s – 3.5 s ».
 */
object ComposerSceneFriseMetrics {

    /** La colonne des NOMS de piste, en dp (64 de texte + 8 d'écart) ; la règle et la tête s'alignent sur elle. */
    const val LABEL_LANE_DP: Float = 72f

    /** La cible d'une poignée de début ou de fin, en dp. */
    const val HANDLE_HIT_DP: Float = 24f

    /** Le pas d'un déplacement au lecteur d'écran (« Plus tôt » / « Plus tard »), en secondes. */
    const val ACCESSIBILITY_STEP: Float = 0.5f

    /** « 1.2 s / 6 s » : la seconde courante au dixième, la durée entière quand elle l'est. Point décimal fixe. */
    fun timeLabel(current: Float, total: Float): String = "${tenths(current, forceDecimal = true)} s / ${tenths(total)} s"

    /** « 1 s – 3.5 s » : la fenêtre d'une piste. */
    fun windowLabel(start: Float, end: Float): String = "${tenths(start)} s – ${tenths(end)} s"

    /** La fraction [0, 1] d'un instant dans la durée ; durée nulle ou instant non fini ⇒ 0. */
    fun fraction(seconds: Float, total: Float): Float =
        if (total <= 0f || !seconds.isFinite()) 0f else (seconds / total).coerceIn(0f, 1f)

    private fun tenths(value: Float, forceDecimal: Boolean = false): String {
        val rounded = (if (value.isFinite()) value else 0f).let { (it * 10).roundToInt() }
        val whole = rounded / 10
        val frac = kotlin.math.abs(rounded % 10)
        return if (frac == 0 && !forceDecimal) "$whole" else "$whole.$frac"
    }
}

package me.meeshy.sdk.model.call.camera

import kotlin.math.abs
import kotlin.math.roundToInt

/** Ce que le système dit d'une caméra : son identifiant, sa face, et sa focale ramenée au plein format (35 mm). */
data class CameraLensProbe(val id: String, val isFront: Boolean, val equivalentFocalMm: Float, val maxDigitalZoom: Float = 1f)

/**
 * Range les caméras ouvrables d'un appareil en objectifs affichés. Le grand-angle (1×) est celui dont
 * la focale équivalente est la plus proche de 26 mm ; un autre objectif n'existe pour l'utilisateur
 * que s'il est franchement plus large (≤ 0,75×) ou plus long (≥ 1,5×) — les capteurs de profondeur,
 * de macro ou doublons ne deviennent jamais une pastille.
 */
object CameraLensClassifier {
    const val MAIN_EQUIVALENT_MM: Float = 26f
    private const val WIDE_LIMIT = 0.75f
    private const val TELE_LIMIT = 1.5f

    fun profile(probes: List<CameraLensProbe>, isFront: Boolean): CameraZoomProfile? {
        val side = probes.filter { it.isFront == isFront && it.equivalentFocalMm > 0f }
        val main = side.minByOrNull { abs(it.equivalentFocalMm - MAIN_EQUIVALENT_MM) } ?: return null
        val others = if (isFront) emptyList() else side.filter { it !== main }.mapNotNull { probe ->
            val ratio = displayRatio(probe.equivalentFocalMm / main.equivalentFocalMm)
            CameraLens(probe.id, ratio).takeIf { ratio <= WIDE_LIMIT || ratio >= TELE_LIMIT }
        }.distinctBy { it.ratio }
        val lenses = (others + CameraLens(main.id, 1f)).distinctBy { it.ratio }
        return CameraZoomPolicy.profile(lenses, isFront, main.maxDigitalZoom)
    }

    /** 0,5 · 0,6 pour les larges (une décimale), l'entier le plus proche pour les longs : 2,96 → 3×, 4,6 → 5×. */
    private fun displayRatio(raw: Float): Float =
        if (raw < 1f) (raw * 10).roundToInt() / 10f else raw.roundToInt().toFloat()
}

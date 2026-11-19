package me.meeshy.sdk.model.call

/**
 * **Le MOS d'un appel** (#19895) : l'E-model simplifié de l'UIT-T G.107, porté à
 * l'identique de `CallMOS.estimate` (MeeshySDK, #11294) et d'`estimateCallMos`
 * (`packages/shared/utils/call-mos.ts`, #19876) pour qu'un même lien rende la
 * même note sur les trois clients, ramené de R (0–100) à une note de 1 à 4,5.
 *
 * - délai en bouche-à-oreille : la moitié de l'aller-retour, deux fois la gigue,
 *   et le délai du codec ;
 * - dégradation par le délai : faible sous 160 ms, forte au-delà ;
 * - dégradation par la perte : `95 · P / (P + Bpl)`, Opus masquant les pertes.
 *
 * Loi pure : une mesure non finie ou négative compte pour 0, la note ne sort
 * jamais de [1, [CEILING]] (la passerelle refuse un MOS hors de [1, 5]).
 */
object CallMos {
    const val CODEC_DELAY_MS: Double = 10.0
    const val LOSS_ROBUSTNESS: Double = 10.0
    const val CEILING: Double = 4.5

    fun estimate(roundTripTimeMs: Double, jitterMs: Double, packetLossPercent: Double): Double {
        val delai = finite(roundTripTimeMs) / 2 + 2 * finite(jitterMs) + CODEC_DELAY_MS
        val parDelai = if (delai < 160) delai / 40 else (delai - 120) / 10
        val perte = minOf(finite(packetLossPercent), 100.0)
        val parPerte = 95 * perte / (perte + LOSS_ROBUSTNESS)
        val r = (93.2 - parDelai - parPerte).coerceIn(0.0, 100.0)
        val mos = 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r)
        return mos.coerceIn(1.0, CEILING)
    }

    private fun finite(value: Double): Double = if (value.isFinite()) maxOf(value, 0.0) else 0.0
}

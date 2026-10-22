package me.meeshy.sdk.model.waveform

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * **La forme que les lecteurs dessinent** — la hauteur d'une barre de la bulle audio (miroir de
 * `AudioPlayerView.waveformHeight`, iOS) et le repli qui tient sa place tant que les vraies
 * valeurs ne sont pas là (miroir de `AudioWaveformAnalyzer.generateFallback`).
 *
 * Les niveaux reçus sont ceux du champ publié : normalisés au pic, lus en LINÉAIRE ([WaveformScale]).
 * Une courbe perceptive douce (`pow 0,65`) relève les passages calmes, pour qu'ils ne s'effondrent
 * pas au plancher à côté de quelques pics : l'enveloppe se lit plus juste à l'oreille.
 *
 * Le repli est DÉTERMINISTE (somme de sinus et de cosinus de la graine `index * 7 + 3`, jamais un
 * tirage) : une bulle qui se recompose, défile ou revient à l'écran garde la même forme jusqu'à
 * l'arrivée des vraies valeurs — rien ne scintille.
 */
object WaveformDisplayCurve {

    const val MIN_HEIGHT_DP: Float = 2f
    const val MAX_HEIGHT_DP: Float = 22f
    const val PERCEPTUAL_EXPONENT: Double = 0.65

    /**
     * Hauteur en dp de la barre [index] sur [total] barres. La barre se projette sur le tableau de
     * niveaux (`index * n / total`), si bien que la densité du rendu et le nombre de valeurs
     * peuvent différer sans en perdre ni en dupliquer. Sans niveaux : le repli procédural.
     */
    fun barHeightDp(index: Int, total: Int, levels: List<Float>): Float {
        if (levels.isEmpty()) return proceduralHeightDp(index)
        val sampleIndex = min(levels.size - 1, index * levels.size / max(1, total)).coerceAtLeast(0)
        val normalized = levels[sampleIndex].coerceIn(0f, 1f).toDouble()
        val curved = normalized.pow(PERCEPTUAL_EXPONENT)
        return max(MIN_HEIGHT_DP, (curved * MAX_HEIGHT_DP).toFloat())
    }

    /** Les [total] hauteurs d'une bulle, dans l'ordre. */
    fun barHeightsDp(total: Int, levels: List<Float>): List<Float> =
        List(max(0, total)) { barHeightDp(it, total, levels) }

    /** La forme de repli d'une barre : lisse, bornée à `2..22` dp, la même à chaque appel. */
    fun proceduralHeightDp(index: Int): Float {
        val seed = (index * 7 + 3).toDouble()
        val base = 5.0 + sin(seed) * 6.0 + cos(seed * 0.5) * 4.0
        return max(MIN_HEIGHT_DP, min(MAX_HEIGHT_DP, base.toFloat()))
    }

    /** [count] niveaux de repli (`0,2..1`) quand un fichier ne se décode pas. */
    fun fallbackLevels(count: Int): List<Float> = List(max(0, count)) { index ->
        val seed = (index * 7 + 3).toDouble()
        val value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
        min(1.0, value).toFloat()
    }
}

package me.meeshy.sdk.model.waveform

import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * **Deux données, deux échelles, jamais l'une sur l'autre.** Miroir de `WaveformScale.swift` (iOS).
 *
 * - La MESURE (le RMS absolu du cache de formes d'onde) se rend lisible en décibels par
 *   [displayHeight] : un RMS linéaire est visuellement plat, la plupart des contenus vivent entre
 *   0,05 et 0,3.
 * - Le CHAMP PUBLIÉ (`waveformSamples` d'un audio de story, `waveform` d'un son côté serveur et
 *   web) est normalisé au pic et se lit en linéaire : [peakNormalized] l'écrit, [publishedHeight]
 *   le lit.
 */
object WaveformScale {

    /** Plancher de l'échelle décibel : en dessous, c'est le silence. */
    const val FLOOR_DECIBELS: Float = -60f

    private const val SILENCE_RMS = 0.0001f

    /** Hauteur d'affichage `0..1` pour un RMS absolu, en échelle décibel (plancher −60 dB). */
    fun displayHeight(rms: Float): Float {
        if (!(rms > SILENCE_RMS)) return 0f
        val decibels = 20f * log10(min(1f, rms))
        return ((decibels - FLOOR_DECIBELS) / -FLOOR_DECIBELS).coerceIn(0f, 1f)
    }

    /**
     * Paliers de résolution : un `count` variant continûment avec le zoom multiplierait les
     * entrées de cache et relancerait une analyse à chaque image d'un pincement. La quantification
     * est ce qui rend le cache utile.
     */
    val bucketTiers: List<Int> = listOf(128, 256, 512, 1024, 2048)

    /** Palier couvrant une barre de [widthDp] dp à la densité écran [density]. */
    fun bucketCount(widthDp: Float, density: Float): Int {
        val target = (widthDp * max(1f, density)).roundToInt()
        return bucketTiers.firstOrNull { it >= target } ?: bucketTiers.last()
    }

    /**
     * La mesure ramenée au contrat du champ publié : la crête vaut 1. Un signal silencieux reste à
     * zéro (pas de division par ~0 qui amplifierait le bruit).
     */
    fun peakNormalized(rms: List<Float>): List<Float> {
        if (rms.isEmpty()) return emptyList()
        val peak = rms.max()
        if (!(peak > SILENCE_RMS)) return List(rms.size) { 0f }
        return rms.map { it / peak }
    }

    /** Hauteur `0..1` d'une valeur du champ publié : déjà normalisée, donc linéaire. */
    fun publishedHeight(value: Float): Float = value.coerceIn(0f, 1f)
}

/**
 * **Ce qu'une série de valeurs EST décide de l'échelle qui la lit.** Une vue qui reçoit tantôt la
 * mesure, tantôt le champ publié (une barre de timeline dont le repli est le champ d'un repost)
 * déclare laquelle elle dessine.
 */
enum class WaveformReading {
    /** La mesure du cache, RMS absolu : échelle décibel. */
    MEASURED,

    /** Le champ publié, normalisé au pic : linéaire. */
    PUBLISHED,
    ;

    /** Hauteur `0..1` d'une valeur de la série. */
    fun height(value: Float): Float = when (this) {
        MEASURED -> WaveformScale.displayHeight(value)
        PUBLISHED -> WaveformScale.publishedHeight(value)
    }
}

/**
 * **Les tailles de relevé que les lecteurs demandent** — des constantes partagées, parce que la clé
 * du cache est (contenu, nombre de compartiments) : deux écrans qui demandent « à peu près la même
 * chose » avec deux nombres différents calculeraient deux fois. Alignées sur iOS.
 */
object WaveformResolution {
    /** Le relevé par défaut (`WaveformCache.samples(count: 80)` côté iOS). */
    const val DEFAULT: Int = 80

    /** Une bulle audio décode au moins 96 compartiments : le rendu (48 ou 72 barres) en sous-échantillonne. */
    const val BUBBLE_MINIMUM: Int = 96

    /** Barres d'une bulle en mise en page compacte. */
    const val BUBBLE_BARS_COMPACT: Int = 48

    /** Barres d'une bulle en mise en page courante. */
    const val BUBBLE_BARS_REGULAR: Int = 72

    /** Les pistes du composer (son, rognage d'un clip). */
    const val COMPOSER_TRACK: Int = 256

    /** La bande de la transcription d'un vocal. */
    const val TRANSCRIPT: Int = 512

    /** Le rogneur plein écran. */
    const val TRIMMER: Int = 2048

    /** Le nombre de barres dessinées par une bulle. */
    fun bubbleBars(compact: Boolean): Int = if (compact) BUBBLE_BARS_COMPACT else BUBBLE_BARS_REGULAR

    /** Le nombre de compartiments à demander pour une bulle qui dessine [barCount] barres. */
    fun bubbleRequest(barCount: Int): Int = max(BUBBLE_MINIMUM, barCount)
}

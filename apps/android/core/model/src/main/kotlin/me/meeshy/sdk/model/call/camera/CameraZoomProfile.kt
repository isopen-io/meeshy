package me.meeshy.sdk.model.call.camera

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/** Un objectif physique de la caméra arrière (ou l'unique de l'avant), à son facteur AFFICHÉ : 1× est toujours le grand-angle. */
data class CameraLens(val id: String, val ratio: Float)

/** Où poser l'image pour un facteur affiché : quel objectif ouvrir, et de combien recadrer (≥ 1) son image. */
data class CameraZoomPlan(val lensId: String, val crop: Float)

enum class CameraZoomStep { Increment, Decrement }

/**
 * Les bornes et les crans d'UNE caméra, en échelle affichée (« 0,5× · 1× · 2× · 3× », comme l'app
 * Appareil photo). Miroir de iOS `CameraZoomProfile` : l'écriture dans l'appareil (ouvrir un
 * objectif, recadrer) est l'affaire de la couche média ; ici seuls des nombres.
 *
 * Sur Android, un objectif physique n'est utilisable que si le système l'expose comme caméra
 * ouvrable : [lenses] ne contient QUE ceux-là, donc les pastilles ne montrent que ce que l'appareil
 * possède. Au sein d'un objectif, le zoom est un recadrage numérique centré.
 */
data class CameraZoomProfile(
    val lenses: List<CameraLens>,
    val maxDisplay: Float,
) {
    private val sorted: List<CameraLens> = lenses.sortedBy { it.ratio }

    val minDisplay: Float get() = sorted.first().ratio

    val baselineDisplay: Float get() = clamped(1f)

    /** Les objectifs physiques, affichés. */
    val lensStops: List<Float> get() = sorted.map { it.ratio }

    /** Les crans de TalkBack : objectifs + paliers numériques. */
    val stops: List<Float> get() = (lensStops + CameraZoomPolicy.DIGITAL_STOPS).inRange().distinct().sorted()

    /** Ce qu'on choisit d'un doigt : les objectifs, plus 2× (le recadrage du capteur principal) quand l'appareil l'atteint. */
    val quickStops: List<Float> get() = (lensStops + CameraZoomPolicy.QUICK_CROP_STOP).inRange().distinct().sorted()

    fun clamped(display: Float): Float = min(max(display, minDisplay), maxDisplay)

    /** Le pincement multiplie le facteur qu'on avait au début du geste. */
    fun display(pinchScale: Float, from: Float): Float = clamped(from * max(pinchScale, 0f))

    /** Au relâcher, un facteur tout proche d'un objectif s'y aimante : une optique franche plutôt que 2,9× numérique. */
    fun settled(display: Float): Float {
        val nearest = lensStops.firstOrNull { abs(display - it) / it <= CameraZoomPolicy.SNAP_TOLERANCE }
        return clamped(nearest ?: display)
    }

    /** Le bouton replié passe au facteur suivant, puis revient au plus large. */
    fun nextQuickStop(after: Float): Float {
        val stops = quickStops
        return stops.firstOrNull { it > after * (1 + CameraZoomPolicy.STEP_TOLERANCE) } ?: stops.firstOrNull() ?: baselineDisplay
    }

    fun stepped(from: Float, step: CameraZoomStep): Float {
        val tolerance = CameraZoomPolicy.STEP_TOLERANCE
        return when (step) {
            CameraZoomStep.Increment -> stops.firstOrNull { it > from * (1 + tolerance) } ?: maxDisplay
            CameraZoomStep.Decrement -> stops.lastOrNull { it < from * (1 - tolerance) } ?: minDisplay
        }
    }

    /** L'objectif le plus long qui ne dépasse pas [display] (à l'aimantation près) et le recadrage qui reste à faire. */
    fun plan(display: Float): CameraZoomPlan {
        val target = clamped(display)
        val base = sorted.lastOrNull { it.ratio <= target * (1 + CameraZoomPolicy.SNAP_TOLERANCE) } ?: sorted.first()
        return CameraZoomPlan(base.id, max(1f, target / base.ratio))
    }

    private fun List<Float>.inRange(): List<Float> = filter { it >= minDisplay && it <= maxDisplay }
}

object CameraZoomPolicy {
    /** Au-delà, le numérique ne montre plus que du bruit à 720p. */
    const val BACK_DISPLAY_CAP: Float = 10f

    /** La caméra avant n'a qu'un objectif : tout est numérique. */
    const val FRONT_DISPLAY_CAP: Float = 3f

    val DIGITAL_STOPS: List<Float> = listOf(1f, 2f, 3f, 5f, 10f)
    const val QUICK_CROP_STOP: Float = 2f
    const val SNAP_TOLERANCE: Float = 0.06f
    const val STEP_TOLERANCE: Float = 0.01f

    /** Puissances de deux par seconde : pendant le geste la rampe suit le doigt, au relâcher et au toucher d'une pastille elle glisse. */
    const val PINCH_RAMP_RATE: Float = 16f
    const val SETTLE_RAMP_RATE: Float = 4f

    /** Le profil d'une caméra : ses objectifs ouvrables et le zoom numérique que son capteur porte. */
    fun profile(lenses: List<CameraLens>, isFront: Boolean, maxDigitalZoom: Float): CameraZoomProfile? {
        if (lenses.isEmpty()) return null
        val cap = if (isFront) FRONT_DISPLAY_CAP else BACK_DISPLAY_CAP
        val widest = lenses.minOf { it.ratio }
        val max = min(cap, rounded(maxDigitalZoom * lenses.maxOf { it.ratio }))
        return CameraZoomProfile(lenses.sortedBy { it.ratio }, max).takeIf { max > widest }
    }

    /** « 0,5× », « 1× », « 2,4× » — une décimale au plus, dans la langue du lecteur. */
    fun label(display: Float, locale: Locale): String {
        val format = NumberFormat.getNumberInstance(locale).apply {
            minimumFractionDigits = 0
            maximumFractionDigits = 1
        }
        return format.format((display * 10).roundToInt() / 10.0) + "×"
    }

    /** Avance [current] vers [target] à [rate] puissances de deux par seconde, sans le dépasser (la rampe de l'appareil, côté iOS). */
    fun ramp(current: Float, target: Float, rate: Float, seconds: Float): Float {
        if (current <= 0f || target <= 0f || current == target) return target
        val octaves = kotlin.math.log2(target / current)
        val allowed = rate * seconds
        if (abs(octaves) <= allowed) return target
        return current * 2.0.pow((if (octaves > 0) allowed else -allowed).toDouble()).toFloat()
    }

    private fun rounded(value: Float): Float = (value * 100).roundToInt() / 100f
}

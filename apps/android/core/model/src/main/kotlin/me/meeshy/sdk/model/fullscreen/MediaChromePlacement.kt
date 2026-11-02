package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.media.ThumbHashImage
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Comment la surface cadre son média : entier (Fit) ou bord à bord (Fill). */
enum class MediaChromeFraming { Fit, Fill }

/** Un rectangle normalisé (0..1) ; [right]/[bottom] exclusifs. */
data class ChromeRect(val left: Double, val top: Double, val right: Double, val bottom: Double) {
    val width: Double get() = right - left
    val height: Double get() = bottom - top
}

/**
 * Le voile noir qu'une surface pose entre son média et ses contrôles, du haut au bas de son
 * cadre. La surface le PEINT depuis cette valeur et la mesure le COMPOSE depuis la même.
 */
data class MediaChromeVeil(val stops: List<Stop>) {
    data class Stop(val location: Double, val opacity: Double)

    fun opacityAt(y: Double): Double {
        val first = stops.firstOrNull() ?: return 0.0
        val last = stops.last()
        if (y <= first.location) return first.opacity
        if (y >= last.location) return last.opacity
        val upper = stops.zipWithNext().firstOrNull { y <= it.second.location } ?: return last.opacity
        val (top, bottom) = upper
        val gap = bottom.location - top.location
        if (gap <= 0) return bottom.opacity
        return top.opacity + (bottom.opacity - top.opacity) * (y - top.location) / gap
    }

    companion object {
        /** Le voile bas du lecteur de Réels : rien sur la moitié haute, noir à 60 % au bord bas. */
        val ReelPlayer = MediaChromeVeil(listOf(Stop(0.0, 0.0), Stop(0.5, 0.0), Stop(1.0, 0.6)))
    }
}

/**
 * Où un contrôle se pose sur le média : son rectangle dans le cadre de la surface (normalisé et
 * arrondi à la grille de [GRID] — une mesure par cellule, jamais par image), le ratio de ce
 * cadre, le cadrage du média dedans et le voile entre les deux. Miroir de `MediaChromePlacement`.
 */
class MediaChromePlacement private constructor(
    private val x0: Int,
    private val y0: Int,
    private val x1: Int,
    private val y1: Int,
    private val aspectMillis: Int,
    val framing: MediaChromeFraming,
    val veil: MediaChromeVeil?,
) {
    val region: ChromeRect
        get() = ChromeRect(x0.toDouble() / GRID, y0.toDouble() / GRID, x1.toDouble() / GRID, y1.toDouble() / GRID)

    val containerAspect: Double get() = aspectMillis / 1000.0

    val signature: String
        get() {
            val veilKey = veil?.stops?.joinToString(",") { "${it.location}:${it.opacity}" } ?: "-"
            return "$x0,$y0,$x1,$y1@$aspectMillis|$framing|$veilKey"
        }

    override fun equals(other: Any?): Boolean = other is MediaChromePlacement && signature == other.signature

    override fun hashCode(): Int = signature.hashCode()

    /**
     * La part du MÉDIA sous le contrôle, en coordonnées normalisées de l'image, rapportée au
     * cadre affiché. Hors du média (bande de letterbox) : la frange du bord le plus proche —
     * c'est elle que le fond flouté de la surface prolonge.
     */
    fun mediaRegion(imageAspect: Double): ChromeRect {
        val frame = containerAspect
        val zone = region
        if (imageAspect <= 0) return zone
        val scale = if (framing == MediaChromeFraming.Fit) min(frame / imageAspect, 1.0) else max(frame / imageAspect, 1.0)
        val width = imageAspect * scale
        val height = scale
        val originX = (frame - width) / 2
        val originY = (1 - height) / 2
        val u = fringe((zone.left * frame - originX) / width, (zone.right * frame - originX) / width)
        val v = fringe((zone.top - originY) / height, (zone.bottom - originY) / height)
        return ChromeRect(u.first, v.first, u.second, v.second)
    }

    /**
     * La luminance de ce que le contrôle a SOUS LUI : la part du média rapportée au cadre, voilée
     * comme la surface la voile. `null` si le raster est inexploitable.
     */
    fun luminance(image: ThumbHashImage): Double? {
        if (image.width <= 0 || image.height <= 0 || image.rgba.size < image.width * image.height * 4) return null
        val zone = mediaRegion(image.width.toDouble() / image.height)
        val frame = region
        var total = 0.0
        for (j in 0 until SIDE) for (i in 0 until SIDE) {
            val u = zone.left + (i + 0.5) / SIDE * zone.width
            val v = zone.top + (j + 0.5) / SIDE * zone.height
            val y = frame.top + (j + 0.5) / SIDE * frame.height
            val keep = 1 - (veil?.opacityAt(y) ?: 0.0)
            total += MediaChromeScheme.pixelLuminance(image, u, v, keep)
        }
        return total / (SIDE * SIDE)
    }

    companion object {
        const val GRID: Int = 64
        private const val SIDE = 16

        fun of(region: ChromeRect, containerAspect: Double, framing: MediaChromeFraming, veil: MediaChromeVeil?): MediaChromePlacement {
            fun start(v: Double) = min(GRID - 1, max(0, floor(v * GRID).toInt()))
            fun end(v: Double, floor: Int) = min(GRID, max(floor + 1, ceil(v * GRID).toInt()))
            val x0 = start(region.left)
            val y0 = start(region.top)
            return MediaChromePlacement(
                x0, y0, end(region.right, x0), end(region.bottom, y0),
                max(1, (containerAspect * 1000).roundToInt()), framing, veil,
            )
        }

        /** Le contrôle mesuré dans le cadre de la surface, tous deux dans le même espace. */
        fun ofControl(control: ChromeRect, container: ChromeRect, framing: MediaChromeFraming, veil: MediaChromeVeil?): MediaChromePlacement? {
            if (control.width <= 0 || control.height <= 0 || container.width <= 0 || container.height <= 0) return null
            return of(
                ChromeRect(
                    (control.left - container.left) / container.width,
                    (control.top - container.top) / container.height,
                    (control.right - container.left) / container.width,
                    (control.bottom - container.top) / container.height,
                ),
                container.width / container.height, framing, veil,
            )
        }

        private fun fringe(start: Double, end: Double): Pair<Double, Double> {
            val minimum = 1.0 / GRID
            val low = min(max(start, 0.0), 1 - minimum)
            return low to max(min(end, 1.0), low + minimum)
        }
    }
}

/** Une mesure : le média, et la place du contrôle dessus. [key] borne la mesure à une fois par média ET cellule. */
class MediaChromeProbe(val backdrop: MediaChromeBackdrop, val placement: MediaChromePlacement) {
    val key: String get() = "${backdrop.key}#${placement.signature}"
}

/** Comment une surface pose des glyphes NUS sur son média. */
sealed interface MediaChromeStage {
    /** Chaque glyphe se mesure dans le cadre de la surface. */
    data class Measured(val framing: MediaChromeFraming, val veil: MediaChromeVeil?) : MediaChromeStage

    /** Le rail déclare l'empreinte ; tous ses glyphes partagent une mesure. */
    data class Declared(val placement: MediaChromePlacement) : MediaChromeStage

    /** La sonde d'un contrôle, ou `null` faute de média ou de cadre. */
    fun probe(backdrop: MediaChromeBackdrop?, control: ChromeRect?, container: ChromeRect?): MediaChromeProbe? {
        backdrop ?: return null
        return when (this) {
            is Declared -> MediaChromeProbe(backdrop, placement)
            is Measured -> {
                if (control == null || container == null) return null
                MediaChromePlacement.ofControl(control, container, framing, veil)?.let { MediaChromeProbe(backdrop, it) }
            }
        }
    }

    companion object {
        /** Le lecteur de Réels : le média entier (Fit) dans la page, sous le voile bas. */
        val ReelPlayer: MediaChromeStage = Measured(MediaChromeFraming.Fit, MediaChromeVeil.ReelPlayer)

        /** Le lecteur de story : le rail (colonne de droite, 0,79→0,96 × 0,115→0,93) sur la carte Fill. */
        fun storyRail(canvasAspect: Double): MediaChromeStage =
            Declared(
                MediaChromePlacement.of(ChromeRect(0.79, 0.115, 0.96, 0.93), canvasAspect, MediaChromeFraming.Fill, null),
            )
    }
}

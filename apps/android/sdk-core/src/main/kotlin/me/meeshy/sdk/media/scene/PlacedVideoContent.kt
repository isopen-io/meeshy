package me.meeshy.sdk.media.scene

import kotlin.math.min
import kotlin.math.sqrt
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/** Une couleur moyenne : composantes PRÉMULTIPLIÉES sur 0–255, opacité sur 0–1. */
internal data class SceneColor(val red: Float, val green: Float, val blue: Float, val alpha: Float) {

    /** Cette couleur posée sur [below]. */
    fun over(below: SceneColor): SceneColor {
        val rest = 1f - alpha
        return SceneColor(red + below.red * rest, green + below.green * rest, blue + below.blue * rest, alpha + below.alpha * rest)
    }

    fun faded(opacity: Float): SceneColor = SceneColor(red * opacity, green * opacity, blue * opacity, alpha * opacity)

    fun distanceTo(other: SceneColor): Float {
        val red = this.red - other.red
        val green = this.green - other.green
        val blue = this.blue - other.blue
        return sqrt(red * red + green * green + blue * blue)
    }

    /** La couleur sous un look (matrice 4×5 d'Android, appliquée aux composantes non prémultipliées). */
    fun under(matrix: FloatArray?): SceneColor {
        if (matrix == null || alpha <= 0f) return this
        val red = this.red / alpha
        val green = this.green / alpha
        val blue = this.blue / alpha
        val opacity = alpha * CHANNEL
        fun row(at: Int) = (matrix[at] * red + matrix[at + 1] * green + matrix[at + 2] * blue + matrix[at + 3] * opacity + matrix[at + 4]).coerceIn(0f, CHANNEL)
        val looked = row(ALPHA_ROW) / CHANNEL
        return SceneColor(row(RED_ROW) * looked, row(GREEN_ROW) * looked, row(BLUE_ROW) * looked, looked)
    }

    companion object {
        val BLACK: SceneColor = SceneColor(0f, 0f, 0f, 1f)

        /** La moyenne de pixels ARGB (non prémultipliés, comme `Bitmap.getPixels` les rend). */
        fun mean(pixels: IntArray): SceneColor? {
            if (pixels.isEmpty()) return null
            var red = 0f
            var green = 0f
            var blue = 0f
            var alpha = 0f
            pixels.forEach { argb ->
                val opacity = (argb ushr ALPHA_SHIFT and BYTE) / CHANNEL
                red += (argb shr RED_SHIFT and BYTE) * opacity
                green += (argb shr GREEN_SHIFT and BYTE) * opacity
                blue += (argb and BYTE) * opacity
                alpha += opacity
            }
            val count = pixels.size.toFloat()
            return SceneColor(red / count, green / count, blue / count, alpha / count)
        }

        private const val CHANNEL = 255f
        private const val BYTE = 0xFF
        private const val ALPHA_SHIFT = 24
        private const val RED_SHIFT = 16
        private const val GREEN_SHIFT = 8
        private const val RED_ROW = 0
        private const val GREEN_ROW = 5
        private const val BLUE_ROW = 10
        private const val ALPHA_ROW = 15
    }
}

/** Une région d'une image, en fractions de sa largeur et de sa hauteur. */
internal data class SceneRegion(val left: Float, val top: Float, val right: Float, val bottom: Float)

/**
 * Un instant relu dans le cadre d'une vidéo posée : ce qu'elle doit y montrer ([expected], son image sous son look et à
 * son opacité, posée sur ce qu'elle recouvre), ce qu'elle recouvre ([under]), ce que le rendu montre ([rendered] ; `null` :
 * illisible) et si un calque d'au-dessus la cache à cet endroit ([covered]).
 */
internal data class PlacedVideoSample(
    val atMillis: Long,
    val label: String,
    val expected: SceneColor,
    val under: SceneColor,
    val rendered: SceneColor?,
    val covered: Boolean,
)

/**
 * **LA PREUVE VOIT LES VIDÉOS POSÉES** (#13897) : sur le S8, un MP4 dont la vidéo posée manquait à toutes les images est
 * passé, parce que la preuve ne confrontait que la luminance la plus haute — celle du dégradé, qui se voyait. Au cœur du
 * cadre d'une vidéo posée, le rendu doit ressembler à la vidéo plus qu'à ce qu'elle recouvre. Un instant où la vidéo se
 * distingue mal de son dessous, où un objet d'au-dessus la cache, ou qui ne se relit pas, n'accuse rien.
 */
internal object PlacedVideoContent {
    /** Écart minimal (RVB sur 0–255) entre la vidéo et son dessous pour juger : en deçà, on ne peut pas les distinguer. */
    const val CONTRAST: Float = 32f

    /** Opacité moyenne au-delà de laquelle un calque d'au-dessus cache la région relue. */
    const val COVERED: Float = 0.25f

    /** Opacité en deçà de laquelle une vidéo qui entre ou sort en fondu ne se juge pas. */
    const val JUDGED_OPACITY: Float = 0.5f

    /** Demi-côté de la région relue, en fraction du petit côté du cadre : un carré centré, dans le cadre à toute rotation. */
    private const val CORE = 0.2f

    fun outputRegion(placement: SceneExportPlacement, format: StoryExportVideoFormat): SceneRegion {
        val half = CORE * min(placement.width, placement.height)
        return SceneRegion(
            (placement.centerX - half) / format.width,
            (placement.centerY - half) / format.height,
            (placement.centerX + half) / format.width,
            (placement.centerY + half) / format.height,
        )
    }

    /** La même région dans la source, que le cadre montre entière à son rapport (recadrage centré). */
    fun sourceRegion(placement: SceneExportPlacement): SceneRegion {
        val half = CORE * min(placement.width, placement.height)
        val across = half / placement.width
        val down = half / placement.height
        return SceneRegion(HALF - across, HALF - down, HALF + across, HALF + down)
    }

    /** `null` : chaque vidéo posée se voit là où elle doit ; sinon, la cause de l'échec. */
    fun verdict(samples: List<PlacedVideoSample>): String? {
        val missing = samples.filter { sample ->
            val rendered = sample.rendered ?: return@filter false
            !sample.covered && sample.expected.distanceTo(sample.under) >= CONTRAST &&
                rendered.distanceTo(sample.under) < rendered.distanceTo(sample.expected)
        }
        val first = missing.firstOrNull() ?: return null
        return "la vidéo posée ${first.label} manque au rendu à ${missing.size} instant(s) : à ${first.atMillis} ms, son cadre montre ce " +
            "qu'elle recouvre"
    }

    private const val HALF = 0.5f
}

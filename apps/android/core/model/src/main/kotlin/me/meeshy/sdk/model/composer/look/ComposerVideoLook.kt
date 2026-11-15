package me.meeshy.sdk.model.composer.look

import kotlin.math.max
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.StoryColorMatrix

/**
 * **LE LOOK D'UNE VIDÉO** (#12736) — miroir de `ComposerLookVideoExporter` (iOS) : la vidéo part avec le filtre
 * et le cadre qu'on voyait. Sur Android, le filtre se grave par la matrice de couleur du GPU (Media3), la même
 * recette que la photo ([ComposerLookColorimetry]) en une passe.
 */
public object ComposerVideoLook {

    /** La matrice 4 × 4 que le GPU pose sur `vec4(rgb, 1)`, colonne par colonne ; `null` pour un filtre neutre. */
    public fun rgbMatrix(preset: VideoFilterPreset): FloatArray? {
        val matrix = SceneLookMatrix.composed(ComposerLookColorimetry.recipe(preset))
        return if (matrix == StoryColorMatrix.IDENTITY) null else rgbMatrix(matrix)
    }

    /** Une matrice 4 × 5 d'Android (décalages sur 0…255) en matrice du GPU : l'alpha d'une vidéo vaut 1. */
    public fun rgbMatrix(matrix: StoryColorMatrix): FloatArray {
        val v = matrix.values
        return FloatArray(GPU_COMPONENTS) { index ->
            val column = index / 4
            val row = index % 4
            when {
                row == 3 -> if (column == 3) 1f else 0f
                column < 3 -> v[row * 5 + column]
                else -> v[row * 5 + 3] + v[row * 5 + 4] / CHANNEL_MAX
            }
        }
    }

    /** Le look touche-t-il aux images : un filtre qui change quelque chose, ou un cadre. */
    public fun paints(look: ComposerPhotoLook): Boolean =
        ComposerLookColorimetry.grades(look.filter) || look.frame != ComposerPhotoFrame.None

    private const val GPU_COMPONENTS = 16
    private const val CHANNEL_MAX = 255f
}

/** Où la vidéo se pose dans la case d'un cadre, en coordonnées du GPU : une échelle, puis un déplacement. */
public data class ComposerVideoFramePlacement(val scale: Float, val translateX: Float, val translateY: Float)

/**
 * **LE CALQUE D'UN CADRE POSÉ SUR UNE VIDÉO** (#12736) — le cadre se peint UNE fois, deux fois en vérité : la prise
 * remplacée par du blanc ([white]) puis par du noir ([black]). Leur écart dit, pixel par pixel, combien la prise se
 * voit ; le calque garde le reste du cadre et se troue là, et la case (là où la prise se voit franchement) dit où
 * poser la vidéo. Hors de la case, un fond tiré de la prise vient de son image fixe ([still]).
 */
public class ComposerVideoFrameMatte(public val pixels: IntArray, public val width: Int, public val height: Int, public val slot: NormalizedCrop?) {

    public companion object {
        private const val SEEN = 0.5f
        private const val UNSEEN = 0.02f
        private const val FULL = 0.99f

        public fun compose(white: IntArray, black: IntArray, still: IntArray?, width: Int, height: Int): ComposerVideoFrameMatte {
            val seen = FloatArray(white.size) { visibility(white[it], black[it]) }
            val slot = slot(seen, width, height)
            val pixels = IntArray(white.size) { index ->
                val v = seen[index]
                val inside = slot?.contains(index % width, index / width) ?: (v > UNSEEN)
                when {
                    v <= UNSEEN || !inside -> still?.get(index) ?: black[index]
                    else -> hole(black[index], v)
                }
            }
            return ComposerVideoFrameMatte(pixels, width, height, slot?.normalized(width, height))
        }

        /** La vidéo, dont les proportions sont celles de la toile, couvre la case, centrée sur elle. */
        public fun placement(slot: NormalizedCrop): ComposerVideoFramePlacement = ComposerVideoFramePlacement(
            scale = max(slot.width, slot.height),
            translateX = (slot.x + slot.width / 2f) * 2f - 1f,
            translateY = 1f - (slot.y + slot.height / 2f) * 2f,
        )

        private fun visibility(white: Int, black: Int): Float {
            val difference = red(white) - red(black) + green(white) - green(black) + blue(white) - blue(black)
            return (difference / (3f * 255f)).coerceIn(0f, 1f)
        }

        private fun red(pixel: Int) = (pixel shr 16) and 0xFF
        private fun green(pixel: Int) = (pixel shr 8) and 0xFF
        private fun blue(pixel: Int) = pixel and 0xFF

        /** Le noir de la prise est le reste du cadre, prémultiplié par ce qui ne se voit pas d'elle. */
        private fun hole(black: Int, seen: Float): Int {
            val kept = 1f - seen
            if (kept <= 0f) return 0
            fun straight(channel: Int) = (channel / kept).toInt().coerceIn(0, 255)
            return ((kept * 255f).toInt() shl 24) or (straight(red(black)) shl 16) or (straight(green(black)) shl 8) or straight(blue(black))
        }

        /** La boîte des pixels où la prise se voit franchement ; `null` si aucun, ou si elle couvre la toile. */
        private fun slot(seen: FloatArray, width: Int, height: Int): Box? {
            var left = width
            var top = height
            var right = -1
            var bottom = -1
            for (index in seen.indices) {
                if (seen[index] <= SEEN) continue
                val x = index % width
                val y = index / width
                if (x < left) left = x
                if (x > right) right = x
                if (y < top) top = y
                if (y > bottom) bottom = y
            }
            if (right < 0) return null
            val box = Box(left, top, right + 1, bottom + 1)
            val whole = box.right - box.left >= width * FULL && box.bottom - box.top >= height * FULL
            return if (whole) null else box
        }
    }

    private data class Box(val left: Int, val top: Int, val right: Int, val bottom: Int) {
        fun contains(x: Int, y: Int): Boolean = x in left until right && y in top until bottom

        fun normalized(width: Int, height: Int): NormalizedCrop = NormalizedCrop(
            left.toFloat() / width,
            top.toFloat() / height,
            (right - left).toFloat() / width,
            (bottom - top).toFloat() / height,
        )
    }
}

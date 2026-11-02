package me.meeshy.sdk.model.composer.look

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import me.meeshy.sdk.model.imageedit.NormalizedCrop

/** Un point d'une image, y vers le bas. */
public data class FacePoint(val x: Float, val y: Float)

/** Une boîte d'une image, y vers le bas : [top] est le haut de la tête. */
public data class FaceBox(val left: Float, val top: Float, val width: Float, val height: Float) {
    val right: Float get() = left + width
    val bottom: Float get() = top + height
    val midX: Float get() = left + width / 2f
    val midY: Float get() = top + height / 2f

    public fun contains(point: FacePoint): Boolean = point.x in left..right && point.y in top..bottom
}

/**
 * Le visage lu sur une prise : sa boîte et, quand ils sont connus, ses yeux et le centre de ses lèvres (#9196,
 * exclu du masque de peau). Miroir de `CallFaceLandmarks` (iOS).
 */
public data class CallFaceLandmarks(
    val bounds: FaceBox,
    val leftEye: FacePoint? = null,
    val rightEye: FacePoint? = null,
    val mouth: FacePoint? = null,
) {

    /** Le visage en proportions de l'image ([width] × [height]) : il survit au changement de taille de la prise. */
    public fun normalized(width: Float, height: Float): CallFaceLandmarks = mapped { x, y -> FacePoint(x / width, y / height) }

    /** Un visage en proportions, posé sur la toile recadrée par [crop], de [width] × [height] pixels. */
    public fun placed(crop: NormalizedCrop?, width: Float, height: Float): CallFaceLandmarks {
        val area = crop ?: NormalizedCrop(0f, 0f, 1f, 1f)
        return mapped { x, y -> FacePoint((x - area.x) / area.width * width, (y - area.y) / area.height * height) }
    }

    /** Un visage en proportions, rendu en pixels d'une image de [width] × [height] (iOS `scaled(to:)`). */
    public fun scaled(width: Float, height: Float): CallFaceLandmarks = mapped { x, y -> FacePoint(x * width, y * height) }

    /**
     * Le visage rapproché de [next] de [factor] (0…1) : la détection d'après ne fait pas sauter l'ornement. Un repère
     * que [next] ne rend plus disparaît, un repère nouveau arrive tel quel (iOS `smoothed(toward:factor:)`).
     */
    public fun smoothed(next: CallFaceLandmarks, factor: Float): CallFaceLandmarks {
        val weight = factor.coerceIn(0f, 1f)
        fun blend(from: Float, to: Float) = from + (to - from) * weight
        fun blend(from: FacePoint?, to: FacePoint?): FacePoint? = when {
            to == null -> null
            from == null -> to
            else -> FacePoint(blend(from.x, to.x), blend(from.y, to.y))
        }
        return CallFaceLandmarks(
            bounds = FaceBox(
                blend(bounds.left, next.bounds.left),
                blend(bounds.top, next.bounds.top),
                blend(bounds.width, next.bounds.width),
                blend(bounds.height, next.bounds.height),
            ),
            leftEye = blend(leftEye, next.leftEye),
            rightEye = blend(rightEye, next.rightEye),
            mouth = blend(mouth, next.mouth),
        )
    }

    private fun mapped(map: (Float, Float) -> FacePoint): CallFaceLandmarks {
        val corner = map(bounds.left, bounds.top)
        val far = map(bounds.right, bounds.bottom)
        return CallFaceLandmarks(
            bounds = FaceBox(corner.x, corner.y, far.x - corner.x, far.y - corner.y),
            leftEye = leftEye?.let { map(it.x, it.y) },
            rightEye = rightEye?.let { map(it.x, it.y) },
            mouth = mouth?.let { map(it.x, it.y) },
        )
    }

    public companion object {
        /** Les yeux tiennent 36 % de la largeur du visage et se posent à 40 % de sa hauteur (`eyeCenters`). */
        private const val EYE_SPAN = 0.36f
        private const val EYE_LINE = 0.4f
        private const val FACE_RATIO = 1.3f

        /** Le visage que décrit un détecteur qui ne rend que le milieu des yeux et leur écart (`android.media.FaceDetector`). */
        public fun fromEyes(midpoint: FacePoint, eyesDistance: Float): CallFaceLandmarks {
            val width = eyesDistance / EYE_SPAN
            val height = width * FACE_RATIO
            val bounds = FaceBox(midpoint.x - width / 2f, midpoint.y - height * EYE_LINE, width, height)
            return CallFaceLandmarks(
                bounds = bounds,
                leftEye = FacePoint(midpoint.x - eyesDistance / 2f, midpoint.y),
                rightEye = FacePoint(midpoint.x + eyesDistance / 2f, midpoint.y),
            )
        }
    }
}

/** Une braise de l'éruption. */
public data class CallEmber(val center: FacePoint, val radius: Float, val opacity: Float)

/**
 * **LA GÉOMÉTRIE DES EFFETS DE VISAGE** (#12733) — miroir de `CallFaceEffectGeometry` (iOS), transposée en y vers le
 * bas (Core Image compte depuis le bas de l'image, le canevas Android depuis le haut). Les mêmes proportions, la
 * même suite pseudo-aléatoire : une verrue ou une braise tombe au même endroit sur les deux plateformes.
 */
public object CallFaceEffectGeometry {

    public fun haloRect(face: FaceBox): FaceBox {
        val width = face.width * 1.05f
        val height = face.width * 0.3f
        val centerY = face.top - face.height * 0.12f
        return FaceBox(face.midX - width / 2f, centerY - height / 2f, width, height)
    }

    public fun hornRects(face: FaceBox): List<FaceBox> {
        val width = face.width * 0.3f
        val height = face.height * 0.42f
        val top = face.top + height * 0.35f - height
        val inset = face.width * 0.12f
        return listOf(FaceBox(face.left + inset, top, width, height), FaceBox(face.right - inset - width, top, width, height))
    }

    public fun eyeCenters(landmarks: CallFaceLandmarks): List<FacePoint> {
        val left = landmarks.leftEye
        val right = landmarks.rightEye
        if (left != null && right != null) return listOf(left, right).sortedBy { it.x }
        val face = landmarks.bounds
        return listOf(
            FacePoint(face.left + face.width * 0.32f, face.top + face.height * 0.4f),
            FacePoint(face.left + face.width * 0.68f, face.top + face.height * 0.4f),
        )
    }

    public fun cheekCenters(face: FaceBox): List<FacePoint> = listOf(
        FacePoint(face.left + face.width * 0.26f, face.top + face.height * 0.64f),
        FacePoint(face.left + face.width * 0.74f, face.top + face.height * 0.64f),
    )

    public fun wartCenters(face: FaceBox, count: Int, seed: ULong): List<FacePoint> =
        (0 until max(0, count)).map { index -> FacePoint(wartX(face, index, seed), wartY(face, index, seed)) }

    /** [wartCenters] écrites en `(x, y)` dans [into], sans rien allouer : l'appel en peint une par image. */
    public fun writeWartCenters(into: FloatArray, face: FaceBox, count: Int, seed: ULong) {
        for (index in 0 until max(0, count)) {
            into[index * 2] = wartX(face, index, seed)
            into[index * 2 + 1] = wartY(face, index, seed)
        }
    }

    private fun wartX(face: FaceBox, index: Int, seed: ULong): Float =
        face.midX + cos(wartAngle(index, seed)) * wartDistance(index, seed) * face.width

    private fun wartY(face: FaceBox, index: Int, seed: ULong): Float =
        face.top + face.height * 0.55f - sin(wartAngle(index, seed)) * wartDistance(index, seed) * face.height * 0.8f

    private fun wartAngle(index: Int, seed: ULong): Float = unit(seed, index, 1uL) * 2f * PI.toFloat()

    private fun wartDistance(index: Int, seed: ULong): Float = sqrt(unit(seed, index, 2uL)) * 0.34f

    public fun wartRadius(face: FaceBox): Float = face.width * 0.025f

    public fun eyeGlowRadius(face: FaceBox, time: Double): Float = face.width * (0.07f + 0.012f * sin(time * 4).toFloat())

    public fun shimmer(time: Double): Float = 0.85f + 0.15f * sin(time * 2.4).toFloat()

    public fun lavaHeight(time: Double, canvasHeight: Float): Float = canvasHeight * (0.16f + 0.03f * sin(time * 1.3).toFloat())

    public fun embers(count: Int, time: Double, width: Float, height: Float, seed: ULong): List<CallEmber> {
        val packed = FloatArray(4 * max(0, count))
        writeEmbers(packed, count, time, width, height, seed)
        return (0 until max(0, count)).map { i ->
            CallEmber(FacePoint(packed[i * 4], packed[i * 4 + 1]), packed[i * 4 + 2], packed[i * 4 + 3])
        }
    }

    /** [embers] écrites en `(x, y, rayon, opacité)` dans [into], sans rien allouer : l'appel en peint par image. */
    public fun writeEmbers(into: FloatArray, count: Int, time: Double, width: Float, height: Float, seed: ULong) {
        val clock = max(0.0, time)
        for (index in 0 until max(0, count)) {
            val speed = 0.12f + 0.18f * unit(seed, index, 3uL)
            val progress = (clock.toFloat() * speed + unit(seed, index, 4uL)) % 1f
            val drift = sin(clock * 1.7 + unit(seed, index, 5uL) * 2 * PI).toFloat() * width * 0.02f
            val baseX = width * (0.04f + 0.92f * unit(seed, index, 6uL))
            into[index * 4] = baseX + drift
            into[index * 4 + 1] = height - progress * height * 0.85f
            into[index * 4 + 2] = width * (0.004f + 0.008f * unit(seed, index, 7uL))
            into[index * 4 + 3] = (1f - progress) * (0.6f + 0.4f * unit(seed, index, 8uL))
        }
    }

    /** La suite `splitmix64` d'iOS, dans `[0, 1)`. */
    public fun unit(seed: ULong, index: Int, salt: ULong): Float {
        var z = seed + index.toULong() * 0x9E3779B97F4A7C15uL + salt * 0xD1B54A32D192ED03uL
        z = (z xor (z shr 30)) * 0xBF58476D1CE4E5B9uL
        z = (z xor (z shr 27)) * 0x94D049BB133111EBuL
        z = z xor (z shr 31)
        return ((z shr 11).toDouble() / (1uL shl 53).toDouble()).toFloat().coerceAtMost(LARGEST_BELOW_ONE)
    }

    private const val LARGEST_BELOW_ONE = 0.99999994f
}

/**
 * Ce que les effets dépensent — miroir de `CallFaceEffectBudget` (iOS). Une photo dépense au régime plein ; l'appel
 * dépense moins dès que l'appareil peine (palier de l'échelle, lissage délesté, appareil qui se protège).
 */
public object CallFaceEffectBudget {
    public const val EMBER_COUNT: Int = 28
    public const val WART_COUNT: Int = 6
    public const val GLOW_REDUCTION: Float = 0.25f
    public const val SEED: ULong = 0x4D656573_68792A2AuL

    /** Les braises se peignent à cinq opacités au plus (iOS `emberOpacityLevels`). */
    public const val EMBER_OPACITY_LEVELS: Int = 5

    /** Part du visage nouvellement détecté dans le visage gardé (iOS `landmarkSmoothing`). */
    public const val LANDMARK_SMOOTHING: Float = 0.5f

    /** Détections manquées d'affilée avant que le visage ne soit oublié (iOS `missesBeforeLosingFace`). */
    public const val MISSES_BEFORE_LOSING_FACE: Int = 3

    public fun detectionStride(isDegraded: Boolean): Int = if (isDegraded) 10 else 5

    public fun emberCount(isDegraded: Boolean): Int = if (isDegraded) 12 else EMBER_COUNT

    public fun wartCount(isDegraded: Boolean): Int = if (isDegraded) 3 else WART_COUNT

    public fun allowsBloom(isDegraded: Boolean): Boolean = !isDegraded
}

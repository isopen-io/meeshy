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

/** Le visage lu sur une prise : sa boîte et, quand ils sont connus, ses yeux. Miroir de `CallFaceLandmarks` (iOS). */
public data class CallFaceLandmarks(val bounds: FaceBox, val leftEye: FacePoint? = null, val rightEye: FacePoint? = null) {

    /** Le visage en proportions de l'image ([width] × [height]) : il survit au changement de taille de la prise. */
    public fun normalized(width: Float, height: Float): CallFaceLandmarks = mapped { x, y -> FacePoint(x / width, y / height) }

    /** Un visage en proportions, posé sur la toile recadrée par [crop], de [width] × [height] pixels. */
    public fun placed(crop: NormalizedCrop?, width: Float, height: Float): CallFaceLandmarks {
        val area = crop ?: NormalizedCrop(0f, 0f, 1f, 1f)
        return mapped { x, y -> FacePoint((x - area.x) / area.width * width, (y - area.y) / area.height * height) }
    }

    private fun mapped(map: (Float, Float) -> FacePoint): CallFaceLandmarks {
        val corner = map(bounds.left, bounds.top)
        val far = map(bounds.right, bounds.bottom)
        return CallFaceLandmarks(
            bounds = FaceBox(corner.x, corner.y, far.x - corner.x, far.y - corner.y),
            leftEye = leftEye?.let { map(it.x, it.y) },
            rightEye = rightEye?.let { map(it.x, it.y) },
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

    public fun wartCenters(face: FaceBox, count: Int, seed: ULong): List<FacePoint> = (0 until max(0, count)).map { index ->
        val angle = unit(seed, index, 1uL) * 2f * PI.toFloat()
        val distance = sqrt(unit(seed, index, 2uL)) * 0.34f
        FacePoint(
            face.midX + cos(angle) * distance * face.width,
            face.top + face.height * 0.55f - sin(angle) * distance * face.height * 0.8f,
        )
    }

    public fun wartRadius(face: FaceBox): Float = face.width * 0.025f

    public fun eyeGlowRadius(face: FaceBox, time: Double): Float = face.width * (0.07f + 0.012f * sin(time * 4).toFloat())

    public fun shimmer(time: Double): Float = 0.85f + 0.15f * sin(time * 2.4).toFloat()

    public fun lavaHeight(time: Double, canvasHeight: Float): Float = canvasHeight * (0.16f + 0.03f * sin(time * 1.3).toFloat())

    public fun embers(count: Int, time: Double, width: Float, height: Float, seed: ULong): List<CallEmber> {
        val clock = max(0.0, time)
        return (0 until max(0, count)).map { index ->
            val speed = 0.12f + 0.18f * unit(seed, index, 3uL)
            val progress = (clock.toFloat() * speed + unit(seed, index, 4uL)) % 1f
            val drift = sin(clock * 1.7 + unit(seed, index, 5uL) * 2 * PI).toFloat() * width * 0.02f
            val baseX = width * (0.04f + 0.92f * unit(seed, index, 6uL))
            CallEmber(
                center = FacePoint(baseX + drift, height - progress * height * 0.85f),
                radius = width * (0.004f + 0.008f * unit(seed, index, 7uL)),
                opacity = (1f - progress) * (0.6f + 0.4f * unit(seed, index, 8uL)),
            )
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

/** Ce que les effets dépensent sur une photo — miroir de `CallFaceEffectBudget` (iOS), au régime plein. */
public object CallFaceEffectBudget {
    public const val EMBER_COUNT: Int = 28
    public const val WART_COUNT: Int = 6
    public const val GLOW_REDUCTION: Float = 0.25f
    public const val SEED: ULong = 0x4D656573_68792A2AuL
}

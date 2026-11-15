package me.meeshy.sdk.model.call.effects

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FacePoint

/**
 * **CE QUE LE VISAGE REÇOIT, décidé une fois par image** — miroir de `CallSkinRetouchPlan` (iOS, #9196).
 * - **Teint naturel** ([tone]), actif par défaut et imperceptible, coupé dès que l'appareil se protège ou que
 *   l'échelle est épuisée.
 * - **Peau lissée** ([smoothing]), au curseur : séparation de fréquences, la texture fine réinjectée à [texture].
 * `null` from [make]: nothing to do on the face — and a stylized effect replaces the retouch.
 */
data class CallSkinRetouchPlan(
    val tone: Float,
    val smoothing: Float,
    val texture: Float,
    val underEye: Float,
    val usesFinePass: Boolean,
) {
    companion object {
        const val TEXTURE_KEPT: Float = 0.35f
        const val UNDER_EYE_SHARE: Float = 0.6f

        fun make(config: VideoFilterConfig, ladder: CallVideoDegradation, isConstrained: Boolean): CallSkinRetouchPlan? {
            val effect = config.activeFaceEffect
            if (effect.isStylized) return null
            val tone = if (config.naturalComplexionEnabled && !isConstrained && !ladder.isExhausted) 1f else 0f
            val smoothing = if (effect == CallFaceEffect.Smoothing && !ladder.isSmoothingDegraded && !ladder.isExhausted) {
                config.skinSmoothingIntensity.coerceIn(0f, 1f)
            } else {
                0f
            }
            if (tone <= 0f && smoothing <= 0f) return null
            val isDegraded = ladder.tier != CallBlurTier.Balanced || ladder.isSmoothingDegraded || isConstrained
            return CallSkinRetouchPlan(tone, smoothing, TEXTURE_KEPT, smoothing * UNDER_EYE_SHARE, usesFinePass = !isDegraded)
        }
    }
}

/** An ellipse of the skin mask, in pixels of the upright image (y down), in the face's tilted frame. */
data class CallSkinEllipse(val centerX: Float, val centerY: Float, val radiusX: Float, val radiusY: Float) {
    fun contains(point: FacePoint, cos: Float, sin: Float): Boolean {
        val dx = point.x - centerX
        val dy = point.y - centerY
        val x = dx * cos + dy * sin
        val y = -dx * sin + dy * cos
        return (x * x) / (radiusX * radiusX) + (y * y) / (radiusY * radiusY) <= 1f
    }
}

/**
 * **LE MASQUE DE PEAU EN ELLIPSES** — miroir de `CallSkinMaskGeometry` (iOS), transposé en y vers le BAS : the face
 * tilted along the eye line, and what is NOT skin — eyes, brows, mouth. Missing landmarks are estimated from the box.
 * The GPU pass multiplies it by a chroma skin likelihood; no mask texture exists.
 */
class CallSkinMaskGeometry(landmarks: CallFaceLandmarks) {
    val face: CallSkinEllipse
    val leftEye: CallSkinEllipse
    val rightEye: CallSkinEllipse
    val leftBrow: CallSkinEllipse
    val rightBrow: CallSkinEllipse
    val mouth: CallSkinEllipse
    val leftUnderEye: CallSkinEllipse
    val rightUnderEye: CallSkinEllipse
    val rotationCos: Float
    val rotationSin: Float

    init {
        val box = landmarks.bounds
        val w = box.width
        val h = box.height
        val estimatedY = box.top + h * EYE_LINE
        val eyes = listOf(
            landmarks.leftEye ?: FacePoint(box.midX - w * 0.2f, estimatedY),
            landmarks.rightEye ?: FacePoint(box.midX + w * 0.2f, estimatedY),
        ).sortedBy { it.x }
        val tilt = atan2(eyes[1].y - eyes[0].y, eyes[1].x - eyes[0].x).coerceIn(-MAX_TILT, MAX_TILT)
        rotationCos = cos(tilt)
        rotationSin = sin(tilt)
        val upX = rotationSin
        val upY = -rotationCos
        fun shifted(point: FacePoint, by: Float) = FacePoint(point.x + upX * by, point.y + upY * by)
        fun ellipse(center: FacePoint, rx: Float, ry: Float) = CallSkinEllipse(center.x, center.y, rx, ry)
        val eyeMid = FacePoint((eyes[0].x + eyes[1].x) / 2f, (eyes[0].y + eyes[1].y) / 2f)

        face = ellipse(shifted(FacePoint(box.midX, box.midY), h * 0.08f), w * 0.52f, h * 0.62f)
        leftEye = ellipse(eyes[0], w * 0.13f, h * 0.075f)
        rightEye = ellipse(eyes[1], w * 0.13f, h * 0.075f)
        leftBrow = ellipse(shifted(eyes[0], h * 0.11f), w * 0.15f, h * 0.045f)
        rightBrow = ellipse(shifted(eyes[1], h * 0.11f), w * 0.15f, h * 0.045f)
        mouth = ellipse(landmarks.mouth ?: shifted(eyeMid, -h * 0.40f), w * 0.21f, h * 0.10f)
        leftUnderEye = ellipse(shifted(eyes[0], -h * 0.11f), w * 0.12f, h * 0.05f)
        rightUnderEye = ellipse(shifted(eyes[1], -h * 0.11f), w * 0.12f, h * 0.05f)
    }

    /** Whether [point] is skin for the geometry alone (before the chroma). */
    fun isSkin(point: FacePoint): Boolean =
        face.contains(point, rotationCos, rotationSin) &&
            listOf(leftEye, rightEye, leftBrow, rightBrow, mouth).none { it.contains(point, rotationCos, rotationSin) }

    /**
     * The geometry in the order the GPU pass reads it: face, eyes L/R, brows L/R, mouth, under-eyes L/R (each
     * `centerX, centerY, radiusX, radiusY`), then the rotation `(cos, sin)` — [PACKED_SIZE] floats.
     */
    fun write(into: FloatArray) {
        listOf(face, leftEye, rightEye, leftBrow, rightBrow, mouth, leftUnderEye, rightUnderEye).forEachIndexed { i, e ->
            into[i * 4] = e.centerX
            into[i * 4 + 1] = e.centerY
            into[i * 4 + 2] = e.radiusX
            into[i * 4 + 3] = e.radiusY
        }
        into[PACKED_SIZE - 2] = rotationCos
        into[PACKED_SIZE - 1] = rotationSin
    }

    companion object {
        const val PACKED_SIZE: Int = 8 * 4 + 2
        val MAX_TILT: Float = (PI / 4).toFloat()

        /** The estimated eye line, from the top of the box (iOS `minY + h × 0.62` from the bottom). */
        private const val EYE_LINE = 0.38f
    }
}

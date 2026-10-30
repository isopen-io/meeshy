package me.meeshy.sdk.model.call.effects

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox

/**
 * An ornament drawn on the face: its centre and size in pixels of the upright image (y down), the [angle] it turns
 * by (radians, clockwise on screen) and whether it is the mirror of its drawing (the right horn).
 */
data class CallOrnament(
    val centerX: Float,
    val centerY: Float,
    val width: Float,
    val height: Float,
    val angle: Float,
    val mirrored: Boolean,
)

/**
 * **OÙ L'AURÉOLE ET LES CORNES SE POSENT** — the rectangles of `CallFaceEffectGeometry` (iOS), turned about the centre
 * of the face by the tilt of the eye line: a head that leans carries its ornaments with it. Head upright, the
 * ornaments fall exactly where iOS puts them.
 */
object CallFaceOrnaments {

    /** The tilt of the eye line (radians, y down), bounded to ±45°; 0 without both eyes. */
    fun tilt(face: CallFaceLandmarks): Float {
        val left = face.leftEye ?: return 0f
        val right = face.rightEye ?: return 0f
        val (a, b) = if (left.x <= right.x) left to right else right to left
        return atan2(b.y - a.y, b.x - a.x).coerceIn(-CallSkinMaskGeometry.MAX_TILT, CallSkinMaskGeometry.MAX_TILT)
    }

    fun halo(face: CallFaceLandmarks): CallOrnament =
        turned(CallFaceEffectGeometry.haloRect(face.bounds), face.bounds, tilt(face), mirrored = false)

    /** The left horn, then the right one — the mirror of the left. */
    fun horns(face: CallFaceLandmarks): List<CallOrnament> {
        val angle = tilt(face)
        return CallFaceEffectGeometry.hornRects(face.bounds).mapIndexed { index, rect ->
            turned(rect, face.bounds, angle, mirrored = index == 1)
        }
    }

    private fun turned(rect: FaceBox, face: FaceBox, angle: Float, mirrored: Boolean): CallOrnament {
        val dx = rect.midX - face.midX
        val dy = rect.midY - face.midY
        val c = cos(angle)
        val s = sin(angle)
        return CallOrnament(
            centerX = face.midX + dx * c - dy * s,
            centerY = face.midY + dx * s + dy * c,
            width = rect.width,
            height = rect.height,
            angle = angle,
            mirrored = mirrored,
        )
    }
}

package me.meeshy.sdk.call.effects

import me.meeshy.sdk.model.call.effects.CallFaceOrnaments
import me.meeshy.sdk.model.call.effects.CallOrnament
import me.meeshy.sdk.model.call.effects.CallSkinMaskGeometry
import me.meeshy.sdk.model.composer.look.CallFaceEffectBudget
import me.meeshy.sdk.model.composer.look.CallFaceEffectGeometry
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks

/**
 * The tracked face laid out in pixels of the upright frame, for the GPU passes: the skin mask, the bumps of the toad,
 * the eyes, the warts, the halo and the horns. It is recomputed only when the tracker hands a NEW face (a detection,
 * every few frames) or the frame changes size — the frames in between reuse it and allocate nothing.
 *
 * Used on the capture (GL) thread only.
 */
internal class CallFaceFrame {
    private var source: CallFaceLandmarks? = null
    private var sourceWidth = 0f
    private var sourceHeight = 0f
    private var sourceDegraded = false

    /** The face in upright pixels, `null` when none is tracked. */
    var face: CallFaceLandmarks? = null
        private set
    val mask = FloatArray(CallSkinMaskGeometry.PACKED_SIZE)

    /** Cheeks then eyes, `(x, y, radius, scale)` each — iOS toad bumps. */
    val bumps = FloatArray(16)

    /** Left eye then right eye, `(x, y)`. */
    val eyes = FloatArray(4)

    /** Centre, half width and height / width of the face box — the toad's skin ellipse. */
    val faceBox = FloatArray(4)
    val warts = FloatArray(2 * CallFaceEffectBudget.WART_COUNT)
    var wartCount = 0
        private set
    var halo: CallOrnament? = null
        private set
    var horns: List<CallOrnament> = emptyList()
        private set

    /** Lays out [unit] (proportions of the upright frame) on a [width] × [height] upright frame; `false` without a face. */
    fun update(unit: CallFaceLandmarks?, width: Float, height: Float, isDegraded: Boolean): Boolean {
        if (unit === source && width == sourceWidth && height == sourceHeight && isDegraded == sourceDegraded) return face != null
        source = unit
        sourceWidth = width
        sourceHeight = height
        sourceDegraded = isDegraded
        val placed = unit?.scaled(width, height)
        face = placed
        if (placed != null) layOut(placed, isDegraded)
        return placed != null
    }

    fun reset() {
        source = null
        face = null
    }

    private fun layOut(face: CallFaceLandmarks, isDegraded: Boolean) {
        CallSkinMaskGeometry(face).write(mask)
        val box = face.bounds
        val cheeks = CallFaceEffectGeometry.cheekCenters(box)
        val eyeCenters = CallFaceEffectGeometry.eyeCenters(face)
        cheeks.forEachIndexed { i, cheek -> bump(i, cheek.x, cheek.y, box.width * 0.2f, 0.45f) }
        eyeCenters.forEachIndexed { i, eye ->
            bump(2 + i, eye.x, eye.y, box.width * 0.11f, 0.55f)
            eyes[i * 2] = eye.x
            eyes[i * 2 + 1] = eye.y
        }
        faceBox[0] = box.midX
        faceBox[1] = box.midY
        faceBox[2] = box.width * 0.5f
        faceBox[3] = if (box.width > 0f) box.height / box.width else 1f
        wartCount = CallFaceEffectBudget.wartCount(isDegraded)
        CallFaceEffectGeometry.writeWartCenters(warts, box, wartCount, CallFaceEffectBudget.SEED)
        halo = CallFaceOrnaments.halo(face)
        horns = CallFaceOrnaments.horns(face)
    }

    private fun bump(index: Int, x: Float, y: Float, radius: Float, scale: Float) {
        bumps[index * 4] = x
        bumps[index * 4 + 1] = y
        bumps[index * 4 + 2] = radius
        bumps[index * 4 + 3] = scale
    }
}

package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.composer.look.CallFaceEffectBudget
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint

/** Le visage gardé après une détection, et les détections manquées d'affilée. */
data class CallFaceSettlement(val face: CallFaceLandmarks?, val misses: Int)

/**
 * **LE SUIVI DU VISAGE PENDANT L'APPEL** — the laws of iOS `CallFaceTracker` (#9102). The face is NEVER looked for on
 * the frame being drawn: detection runs off the capture thread at a bounded cadence, and every frame draws with the
 * last face known. The face is kept in proportions of the UPRIGHT image (y down), so it follows a rotation without
 * waiting for the next detection.
 */
object CallFaceTracking {
    /** Width of the probe the detector reads: the camera image is never read whole (iOS `probeWidth`). */
    const val PROBE_WIDTH: Int = 320

    /**
     * Whether frame number [frame] (counted from 1) sends a detection: every stride, and every other frame while no
     * face is known — a face that appears is found fast, a face already held is refreshed at the dosed cadence.
     */
    fun isDetectionDue(frame: Int, hasFace: Boolean, isDegraded: Boolean): Boolean =
        frame % CallFaceEffectBudget.detectionStride(isDegraded) == 0 || (!hasFace && frame % 2 == 0)

    /** The face kept once a detection answers ([detected] `null`: no face found this time). */
    fun settled(current: CallFaceLandmarks?, detected: CallFaceLandmarks?, misses: Int): CallFaceSettlement {
        if (detected == null) {
            val missed = misses + 1
            return CallFaceSettlement(current.takeIf { missed < CallFaceEffectBudget.MISSES_BEFORE_LOSING_FACE }, missed)
        }
        val face = current?.smoothed(detected, CallFaceEffectBudget.LANDMARK_SMOOTHING) ?: detected
        return CallFaceSettlement(face, 0)
    }

    /** A detection in pixels of the upright probe, as a face in proportions of that image. */
    fun fromDetection(
        box: FaceBox,
        leftEye: FacePoint?,
        rightEye: FacePoint?,
        mouth: FacePoint?,
        uprightWidth: Float,
        uprightHeight: Float,
    ): CallFaceLandmarks =
        CallFaceLandmarks(box, leftEye, rightEye, mouth).normalized(uprightWidth, uprightHeight)
}

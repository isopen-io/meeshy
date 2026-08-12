package me.meeshy.sdk.model.call

/**
 * Pure average-luma sampler for a video frame's Y plane — the framework-agnostic
 * half of the camera-covered detector, feeding [DarkFramePolicy]. Port of the
 * luma-averaging loop inside iOS `DarkFrameDetector.analyzeFrame`, isolated here
 * as a total function so the sampling maths is unit-testable without a real
 * capture buffer.
 *
 * A WebRTC I420 frame exposes its luma as a `Y` plane of unsigned bytes with a
 * `rowStride` that may exceed the visible `width` (row padding). The Android
 * actuator (a `VideoProcessor`/`VideoSink` seam) reads that plane into a
 * `ByteArray` and hands it here; nothing in this object depends on `org.webrtc`.
 */
object FrameLuminance {

    /** Sample every Nth pixel on both axes — cheap yet representative. iOS `step`. */
    const val DEFAULT_SAMPLE_STEP: Int = 8

    /**
     * Average luma (0..255) over a sub-sampled Y plane. Unsigned bytes are read
     * every [step] pixels across [width] and every [step] rows down [height],
     * using [rowStride] (≥ [width]) to skip any row padding.
     *
     * Returns `null` — meaning "no usable reading, skip this frame" — when the
     * geometry is degenerate (a non-positive dimension/step, or a plane too
     * small for the declared geometry) rather than fabricating a `0.0`
     * pitch-black reading that would falsely trip the cover detector. This
     * mirrors iOS's `guard … else { return }` early-outs.
     *
     * @param yPlane the frame's luma bytes (unsigned; `0xFF` is 255, not −1).
     * @param width visible frame width in pixels.
     * @param height visible frame height in pixels.
     * @param rowStride bytes per row of [yPlane] (defaults to [width] for a
     *   tightly packed plane).
     * @param step pixel sampling stride on both axes.
     */
    fun averageOfYPlane(
        yPlane: ByteArray,
        width: Int,
        height: Int,
        rowStride: Int = width,
        step: Int = DEFAULT_SAMPLE_STEP,
    ): Float? {
        if (width <= 0 || height <= 0 || step <= 0 || rowStride < width) return null

        var sum = 0L
        var count = 0
        var y = 0
        while (y < height) {
            val rowBase = y * rowStride
            var x = 0
            while (x < width) {
                val offset = rowBase + x
                if (offset >= yPlane.size) return null
                sum += (yPlane[offset].toInt() and 0xFF)
                count++
                x += step
            }
            y += step
        }
        if (count == 0) return null
        return sum.toFloat() / count.toFloat()
    }
}

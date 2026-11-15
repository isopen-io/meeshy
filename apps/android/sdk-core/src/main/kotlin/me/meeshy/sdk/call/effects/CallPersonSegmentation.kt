package me.meeshy.sdk.call.effects

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import me.meeshy.sdk.model.call.effects.CallBlurTier
import me.meeshy.sdk.model.call.effects.CallFrameOrientation
import me.meeshy.sdk.model.call.effects.CallSegmentationQuality
import me.meeshy.sdk.model.call.effects.CallVideoEffectsPlan
import org.webrtc.VideoFrame
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** A person mask: one byte per cell, 255 = the person, rows top-first in the UPRIGHT image. */
internal class CallPersonMask(val width: Int, val height: Int, val values: ByteArray)

/** Cuts the person out of an upright image, asynchronously; [onMask] gets `null` on failure. */
internal interface CallPersonSegmenter {
    fun segment(image: Bitmap, onMask: (CallPersonMask?) -> Unit)
    fun close()
}

/** ML Kit Selfie Segmentation, bundled model, stream mode (temporal coherence), raw-size mask. */
internal class MlKitPersonSegmenter : CallPersonSegmenter {
    private val client: Segmenter by lazy {
        Segmentation.getClient(
            SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                .enableRawSizeMask()
                .build(),
        )
    }

    override fun segment(image: Bitmap, onMask: (CallPersonMask?) -> Unit) {
        client.process(InputImage.fromBitmap(image, 0))
            .addOnSuccessListener { mask ->
                val buffer = mask.buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
                val bytes = ByteArray(mask.width * mask.height) { (buffer.get(it).coerceIn(0f, 1f) * 255f).toInt().toByte() }
                onMask(CallPersonMask(mask.width, mask.height, bytes))
            }
            .addOnFailureListener { onMask(null) }
    }

    override fun close() {
        runCatching { client.close() }
    }
}

/**
 * The person mask of the call, computed OFF the capture thread at the rung's cadence, eased in time
 * (60 % new, iOS `maskNewWeight`) and reused by every frame until the next one. One segmentation in
 * flight at most: a slow segmenter lowers the mask cadence, never the camera's.
 *
 * [submitIfDue] and [takeFresh] run on the capture (GL) thread; the segmenter answers on its own.
 */
internal class CallPersonMaskStore(private val segmenter: CallPersonSegmenter) {
    private val inFlight = AtomicBoolean(false)
    private val generation = AtomicInteger(0)
    private val lock = Any()
    private var lastSubmissionNanos: Long? = null
    private var smoothed: CallPersonMask? = null
    private var fresh: CallPersonMask? = null
    private var hasMask = false
    private var pixels = IntArray(0)
    private var image: Bitmap? = null

    /** Whether a mask exists for the current generation (the blur composites only then). */
    val isReady: Boolean get() = synchronized(lock) { hasMask }

    fun submitIfDue(buffer: VideoFrame.TextureBuffer, rotation: Int, nowNanos: Long, rung: CallBlurTier.Segmentation) {
        if (inFlight.get() || !CallVideoEffectsPlan.isMaskDue(lastSubmissionNanos, nowNanos, rung.framesPerSecond)) return
        val bitmap = uprightCopy(buffer, rotation, inputWidth(rung.quality)) ?: return
        val token = generation.get()
        inFlight.set(true)
        lastSubmissionNanos = nowNanos
        segmenter.segment(bitmap) { mask ->
            if (mask != null && generation.get() == token) settle(mask)
            inFlight.set(false)
        }
    }

    /** The mask that arrived since the last call, to upload; `null` when nothing new. */
    fun takeFresh(): CallPersonMask? = synchronized(lock) { fresh.also { fresh = null } }

    fun reset() {
        generation.incrementAndGet()
        lastSubmissionNanos = null
        synchronized(lock) {
            smoothed = null
            fresh = null
            hasMask = false
        }
    }

    fun close() {
        reset()
        segmenter.close()
        image = null
    }

    private fun settle(mask: CallPersonMask) {
        synchronized(lock) {
            val previous = smoothed?.takeIf { it.width == mask.width && it.height == mask.height }
            val eased = previous?.let { blend(it, mask) } ?: mask
            smoothed = eased
            fresh = eased
            hasMask = true
        }
    }

    private fun blend(previous: CallPersonMask, next: CallPersonMask): CallPersonMask {
        val values = ByteArray(next.values.size) { i ->
            val old = previous.values[i].toInt() and 0xFF
            val new = next.values[i].toInt() and 0xFF
            ((old * (1f - NEW_WEIGHT)) + new * NEW_WEIGHT).toInt().toByte()
        }
        return CallPersonMask(next.width, next.height, values)
    }

    /** A small upright ARGB copy of the frame: the segmenter sees the person standing. */
    private fun uprightCopy(buffer: VideoFrame.TextureBuffer, rotation: Int, targetWidth: Int): Bitmap? {
        val width = targetWidth.coerceAtMost(buffer.width) and 1.inv()
        val height = ((buffer.height.toLong() * width / buffer.width).toInt() and 1.inv()).coerceAtLeast(2)
        val scaled = buffer.cropAndScale(0, 0, buffer.width, buffer.height, width, height)
        val i420 = try {
            scaled.toI420()
        } finally {
            scaled.release()
        } ?: return null
        try {
            val (uw, uh) = CallFrameOrientation.uprightSize(width, height, rotation)
            if (pixels.size != uw * uh) pixels = IntArray(uw * uh)
            val y = i420.dataY
            val u = i420.dataU
            val v = i420.dataV
            for (row in 0 until uh) for (col in 0 until uw) {
                val packed = CallFrameOrientation.bufferPixel(col, row, width, height, rotation)
                val bx = packed ushr 16
                val by = packed and 0xFFFF
                val luma = (y.get(by * i420.strideY + bx).toInt() and 0xFF) - 16
                val cb = (u.get((by / 2) * i420.strideU + bx / 2).toInt() and 0xFF) - 128
                val cr = (v.get((by / 2) * i420.strideV + bx / 2).toInt() and 0xFF) - 128
                val l = 1.164f * luma
                val r = (l + 1.596f * cr).toInt().coerceIn(0, 255)
                val g = (l - 0.392f * cb - 0.813f * cr).toInt().coerceIn(0, 255)
                val b = (l + 2.017f * cb).toInt().coerceIn(0, 255)
                pixels[row * uw + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
            val target = image?.takeIf { it.width == uw && it.height == uh }
                ?: Bitmap.createBitmap(uw, uh, Bitmap.Config.ARGB_8888).also { image = it }
            target.setPixels(pixels, 0, uw, 0, 0, uw, uh)
            return target
        } finally {
            i420.release()
        }
    }

    private fun inputWidth(quality: CallSegmentationQuality): Int = when (quality) {
        CallSegmentationQuality.Balanced -> 256
        CallSegmentationQuality.Fast -> 160
    }

    private companion object {
        const val NEW_WEIGHT = 0.6f
    }
}

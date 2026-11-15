package me.meeshy.sdk.call.effects

import android.graphics.PointF
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import me.meeshy.sdk.model.call.effects.CallFaceTracking
import me.meeshy.sdk.model.call.effects.CallFrameOrientation
import me.meeshy.sdk.model.composer.look.CallFaceLandmarks
import me.meeshy.sdk.model.composer.look.FaceBox
import me.meeshy.sdk.model.composer.look.FacePoint
import org.webrtc.VideoFrame
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Looks for the largest face of an NV21 probe whose buffer must turn [rotation] degrees clockwise to stand up, and
 * answers OFF the capture thread, in proportions of the UPRIGHT image (y down); `null` without a face.
 */
internal interface CallFaceDetecting {
    fun detect(nv21: ByteArray, width: Int, height: Int, rotation: Int, onFace: (CallFaceLandmarks?) -> Unit)
    fun close()
}

/**
 * ML Kit Face Detection, fast mode, landmarks only — the eyes, the mouth corners and the box are all the effects
 * read (iOS reads the same from Vision). No contours, no classification. The model is served by Play Services and
 * declared for install time (sdk-core manifest): the bundled one weighs ~13 MB per device. Until it is there (or on
 * a device without Play Services) every detection fails, answers `null`, and the effects draw without a face.
 */
internal class MlKitFaceDetector : CallFaceDetecting {
    private val client: FaceDetector by lazy {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .setMinFaceSize(MIN_FACE_SIZE)
                .build(),
        )
    }
    private val inPlace = Executor { it.run() }

    override fun detect(nv21: ByteArray, width: Int, height: Int, rotation: Int, onFace: (CallFaceLandmarks?) -> Unit) {
        val (uprightWidth, uprightHeight) = CallFrameOrientation.uprightSize(width, height, rotation)
        val image = InputImage.fromByteArray(nv21, width, height, CallFrameOrientation.normalised(rotation), InputImage.IMAGE_FORMAT_NV21)
        client.process(image)
            .addOnSuccessListener(inPlace) { faces ->
                onFace(faces.maxByOrNull { it.boundingBox.width() }?.let { landmarks(it, uprightWidth.toFloat(), uprightHeight.toFloat()) })
            }
            .addOnFailureListener(inPlace) { onFace(null) }
    }

    override fun close() {
        runCatching { client.close() }
    }

    private fun landmarks(face: Face, width: Float, height: Float): CallFaceLandmarks {
        val box = face.boundingBox
        fun point(type: Int): FacePoint? = face.getLandmark(type)?.position?.let(::point)
        val corners = listOfNotNull(point(FaceLandmark.MOUTH_LEFT), point(FaceLandmark.MOUTH_RIGHT), point(FaceLandmark.MOUTH_BOTTOM))
        val mouth = corners.takeIf { it.size == 3 }?.let { FacePoint(it.sumOf { p -> p.x.toDouble() }.toFloat() / 3f, it.sumOf { p -> p.y.toDouble() }.toFloat() / 3f) }
        return CallFaceTracking.fromDetection(
            box = FaceBox(box.left.toFloat(), box.top.toFloat(), box.width().toFloat(), box.height().toFloat()),
            leftEye = point(FaceLandmark.LEFT_EYE),
            rightEye = point(FaceLandmark.RIGHT_EYE),
            mouth = mouth,
            uprightWidth = width,
            uprightHeight = height,
        )
    }

    private fun point(position: PointF) = FacePoint(position.x, position.y)

    private companion object {
        const val MIN_FACE_SIZE = 0.15f
    }
}

/**
 * **LE VISAGE SUIVI PENDANT L'APPEL** — iOS `CallFaceTracker` (#9102). The face is never looked for on the frame
 * being drawn: a small NV21 probe (320 px wide) leaves for the detector at the cadence of [CallFaceTracking], one
 * detection in flight at most, and every frame draws with the last face known. A slow detector lowers the face
 * cadence, never the camera's.
 *
 * [landmarks] runs on the capture (GL) thread; the detector answers on its own.
 */
internal class CallFaceTracker(private val detector: CallFaceDetecting) {
    private val inFlight = AtomicBoolean(false)
    private val generation = AtomicInteger(0)
    private val lock = Any()
    private var face: CallFaceLandmarks? = null
    private var misses = 0
    private var frame = 0
    private var probe = ByteArray(0)

    /** The last face known, in proportions of the upright image; asks for a new one when it is due. */
    fun landmarks(buffer: VideoFrame.TextureBuffer, rotation: Int, isDegraded: Boolean): CallFaceLandmarks? {
        frame = if (frame >= FRAME_WRAP) 1 else frame + 1
        val current = synchronized(lock) { face }
        if (!inFlight.get() && CallFaceTracking.isDetectionDue(frame, current != null, isDegraded)) submit(buffer, rotation)
        return current
    }

    fun reset() {
        generation.incrementAndGet()
        frame = 0
        synchronized(lock) {
            face = null
            misses = 0
        }
    }

    fun close() {
        reset()
        detector.close()
    }

    private fun submit(buffer: VideoFrame.TextureBuffer, rotation: Int) {
        val width = CallFaceTracking.PROBE_WIDTH.coerceAtMost(buffer.width) and 1.inv()
        val height = ((buffer.height.toLong() * width / buffer.width).toInt() and 1.inv()).coerceAtLeast(2)
        if (width < 2 || !fillProbe(buffer, width, height)) return
        val token = generation.get()
        inFlight.set(true)
        try {
            detector.detect(probe, width, height, rotation) { detected ->
                if (generation.get() == token) settle(detected)
                inFlight.set(false)
            }
        } catch (failure: RuntimeException) {
            inFlight.set(false)
            throw failure
        }
    }

    private fun settle(detected: CallFaceLandmarks?) {
        synchronized(lock) {
            val next = CallFaceTracking.settled(face, detected, misses)
            face = next.face
            misses = next.misses
        }
    }

    /** The frame scaled down on the GPU, read back as I420 and laid out as NV21 in the reused [probe]. */
    private fun fillProbe(buffer: VideoFrame.TextureBuffer, width: Int, height: Int): Boolean {
        val scaled = buffer.cropAndScale(0, 0, buffer.width, buffer.height, width, height)
        val i420 = try {
            scaled.toI420()
        } finally {
            scaled.release()
        } ?: return false
        try {
            val size = width * height
            if (probe.size != size * 3 / 2) probe = ByteArray(size * 3 / 2)
            val y = i420.dataY
            for (row in 0 until height) {
                y.position(row * i420.strideY)
                y.get(probe, row * width, width)
            }
            val u = i420.dataU
            val v = i420.dataV
            for (row in 0 until height / 2) {
                val line = size + row * width
                for (col in 0 until width / 2) {
                    probe[line + col * 2] = v.get(row * i420.strideV + col)
                    probe[line + col * 2 + 1] = u.get(row * i420.strideU + col)
                }
            }
            return true
        } finally {
            i420.release()
        }
    }

    private companion object {
        const val FRAME_WRAP = 1_000_000_000
    }
}

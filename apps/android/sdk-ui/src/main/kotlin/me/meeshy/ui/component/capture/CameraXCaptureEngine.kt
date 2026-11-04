package me.meeshy.ui.component.capture

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.view.OrientationEventListener
import android.view.Surface
import android.os.SystemClock
import android.util.Log
import android.view.WindowManager
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.MirrorMode
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.camera.ComposerCameraSwitchRule
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.util.concurrent.TimeUnit
import com.google.common.util.concurrent.ListenableFuture
import me.meeshy.sdk.model.camera.CameraFirstFrameClock
import me.meeshy.sdk.model.camera.ComposerCameraInputSwap
import me.meeshy.sdk.model.camera.ComposerCaptureInputGraph
import me.meeshy.sdk.model.camera.ComposerCaptureMirrorRule
import me.meeshy.sdk.model.camera.ComposerCaptureRunning
import me.meeshy.sdk.model.camera.ComposerCaptureSession
import me.meeshy.sdk.model.composer.capture.CaptureFlashMode
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
import me.meeshy.sdk.model.composer.capture.CaptureTargetRotation
import me.meeshy.sdk.model.composer.capture.CaptureTorchMode

/**
 * L'implémentation CameraX du viseur : aperçu, photo JPEG d'origine, segments vidéo MP4, torche, zoom, mise au point.
 *
 * Aucun travail lourd sur le fil principal : CameraX pose ses propres exécuteurs, les rappels ne font que relayer
 * un signal. La caméra se REND à [release] (désabonnement, arrêt de la prise) — le viseur ne la retient jamais
 * quand l'écran s'en va.
 */
public class CameraXCaptureEngine(
    private val context: Context,
    private val lifecycleOwner: LifecycleOwner,
    private val sink: (CaptureEngineSignal) -> Unit,
) : CaptureCameraEngine {

    private val mainExecutor = ContextCompat.getMainExecutor(context)
    private val previewView = PreviewView(context).apply {
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        scaleType = PreviewView.ScaleType.FILL_CENTER
    }
    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var recordingToken: String? = null
    private var cancelRequested = false
    private var released = false
    private var minZoom = 1f
    private var maxZoom = 1f
    private var targetRotation = displayRotation()
    private var facing = CaptureLensFacing.BACK
    private var cover by mutableStateOf<Bitmap?>(null)
    private var desiredFacing = CaptureLensFacing.BACK
    private val clock = CameraFirstFrameClock()
    private val session = ComposerCaptureSession(mainExecutor)

    /** La session de capture : lier = lancer, délier = arrêter ; le dernier vœu gagne (une rafale finit en marche). */
    private val running = object : ComposerCaptureRunning {
        override val isRunning: Boolean get() = camera != null
        override fun start() { if (!released) startBound(desiredFacing) }
        override fun stop() { teardown() }
    }

    /** La bascule d'objectif : l'entrée est échangée en UNE configuration, un refus remet l'ancienne en place. */
    private val lensGraph = object : ComposerCaptureInputGraph<CaptureLensFacing> {
        override fun beginConfiguration() = Unit
        override fun commitConfiguration() = Unit
        override fun removeInput(input: CaptureLensFacing) { provider?.unbindAll(); camera = null }
        override fun canAddInput(input: CaptureLensFacing): Boolean =
            runCatching { provider?.hasCamera(selectorOf(input)) == true }.getOrDefault(false)
        override fun addInput(input: CaptureLensFacing): Boolean = runCatching { bindUseCases(input) }.isSuccess
    }

    /** La gravité, pas l'écran : la photo et la vidéo sortent comme le téléphone est tenu. */
    private val horizon = object : OrientationEventListener(context) {
        override fun onOrientationChanged(orientation: Int) {
            val rotation = CaptureTargetRotation.fromDegrees(orientation) ?: return
            if (rotation == targetRotation) return
            targetRotation = rotation
            imageCapture?.targetRotation = rotation
            videoCapture?.targetRotation = rotation
        }
    }

    override fun bind(facing: CaptureLensFacing) {
        if (released) return
        desiredFacing = facing
        if (camera != null) {
            raiseCover()
            session.perform { swapLens(facing) }
            return
        }
        val prewarmed = warm?.isDone == true
        clock.start(prewarmed, SystemClock.elapsedRealtime())
        val future = warm ?: ProcessCameraProvider.getInstance(context.applicationContext).also { warm = it }
        future.addListener({
            if (released) return@addListener
            runCatching { provider = future.get() }
                .onSuccess { session.setRunning(true, running) }
                .onFailure { sink(CaptureEngineSignal.BindFailed(it.message ?: "bind")) }
        }, mainExecutor)
    }

    private fun startBound(target: CaptureLensFacing) {
        runCatching { bindUseCases(target) }
            .onSuccess { sink(CaptureEngineSignal.Bound(target, it)) }
            .onFailure { sink(CaptureEngineSignal.BindFailed(it.message ?: "bind")) }
    }

    private fun swapLens(target: CaptureLensFacing) {
        if (released) return
        val old = if (camera != null) facing else null
        val outcome = ComposerCameraInputSwap.swap(lensGraph, old, target)
        val published = ComposerCameraInputSwap.publishedPosition(outcome, target, old)
        val bound = camera
        if (published == null || bound == null) {
            cover = null
            sink(CaptureEngineSignal.BindFailed("swap"))
            return
        }
        sink(CaptureEngineSignal.Bound(published, lensInfo(bound)))
        previewView.postDelayed({ cover = null }, ComposerCameraSwitchRule.COVER_HOLD_MS)
    }

    /** La dernière trame de l'ancien objectif, réduite, couvre l'aperçu le temps que le nouveau serve la sienne. */
    private fun raiseCover() {
        val frame = previewView.bitmap ?: return
        val width = ComposerCameraSwitchRule.coverWidth(frame.width)
        if (width <= 0) return
        val height = (frame.height.toLong() * width / frame.width).toInt().coerceAtLeast(1)
        cover = Bitmap.createScaledBitmap(frame, width, height, true)
    }

    private fun selectorOf(facing: CaptureLensFacing): CameraSelector =
        if (facing == CaptureLensFacing.FRONT) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA

    private fun lensInfo(bound: Camera): CaptureLensInfo {
        val zoom = bound.cameraInfo.zoomState.value
        minZoom = zoom?.minZoomRatio ?: 1f
        maxZoom = zoom?.maxZoomRatio ?: 1f
        return CaptureLensInfo(minZoom, maxZoom, bound.cameraInfo.hasFlashUnit())
    }

    private fun bindUseCases(target: CaptureLensFacing): CaptureLensInfo {
        val provider = provider ?: error("no provider")
        val selector = selectorOf(target)
        val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val photo = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .setTargetRotation(targetRotation)
            .build()
        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
            .build()
        val video = VideoCapture.Builder(recorder)
            .setTargetRotation(targetRotation)
            .setMirrorMode(if (ComposerCaptureMirrorRule.mirrors(ComposerCaptureMirrorRule.Output.MOVIE, target)) MirrorMode.MIRROR_MODE_ON_FRONT_ONLY else MirrorMode.MIRROR_MODE_OFF)
            .build()
        provider.unbindAll()
        val bound = provider.bindToLifecycle(lifecycleOwner, selector, preview, photo, video)
        camera = bound
        facing = target
        imageCapture = photo
        videoCapture = video
        if (horizon.canDetectOrientation()) horizon.enable()
        watchFirstFrame()
        return lensInfo(bound)
    }

    private fun watchFirstFrame() {
        previewView.previewStreamState.removeObservers(lifecycleOwner)
        previewView.previewStreamState.observe(lifecycleOwner) { state ->
            if (state != PreviewView.StreamState.STREAMING) return@observe
            clock.report(SystemClock.elapsedRealtime())?.let { Log.i(TAG, it.logLine) }
        }
    }

    override fun takePhoto(token: String, file: File) {
        val capture = imageCapture ?: return sink(CaptureEngineSignal.PhotoFailed(token))
        val mirrored = ComposerCaptureMirrorRule.mirrors(ComposerCaptureMirrorRule.Output.PHOTO, facing)
        val options = ImageCapture.OutputFileOptions.Builder(file)
            .setMetadata(ImageCapture.Metadata().apply { isReversedHorizontal = mirrored })
            .build()
        capture.takePicture(options, mainExecutor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                if (released) file.delete() else sink(CaptureEngineSignal.PhotoSaved(token, file))
            }
            override fun onError(exception: ImageCaptureException) = sink(CaptureEngineSignal.PhotoFailed(token))
        })
    }

    @SuppressLint("MissingPermission")
    override fun startRecording(token: String, file: File) {
        val capture = videoCapture ?: return sink(CaptureEngineSignal.SegmentFailed(token))
        if (recording != null) return
        cancelRequested = false
        recordingToken = token
        var pending = capture.output.prepareRecording(context, FileOutputOptions.Builder(file).build())
        if (hasMicrophone()) pending = pending.withAudioEnabled()
        recording = pending.start(mainExecutor) { event -> onRecordEvent(token, file, event) }
    }

    private fun hasMicrophone(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun onRecordEvent(token: String, file: File, event: VideoRecordEvent) {
        when (event) {
            is VideoRecordEvent.Start -> {
                sink(CaptureEngineSignal.RecordingStarted(token))
                if (cancelRequested) recording?.stop()
            }
            is VideoRecordEvent.Finalize -> finalizeSegment(token, file, event)
            else -> Unit
        }
    }

    private fun finalizeSegment(token: String, file: File, event: VideoRecordEvent.Finalize) {
        recording = null
        recordingToken = null
        val cancelled = cancelRequested || released
        cancelRequested = false
        val seconds = TimeUnit.NANOSECONDS.toMillis(event.recordingStats.recordedDurationNanos) / 1000.0
        val usable = !event.hasError() || (file.length() > 0 && event.error != VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA)
        when {
            cancelled -> { file.delete(); sink(CaptureEngineSignal.SegmentCancelled(token)) }
            usable && file.length() > 0 -> sink(CaptureEngineSignal.SegmentFinalized(token, file, seconds))
            else -> { file.delete(); sink(CaptureEngineSignal.SegmentFailed(token)) }
        }
    }

    override fun stopRecording() {
        recording?.stop()
    }

    override fun cancelRecording() {
        cancelRequested = true
        recording?.stop()
    }

    override fun setTorch(mode: CaptureTorchMode) {
        camera?.cameraControl?.enableTorch(mode == CaptureTorchMode.ON)
    }

    override fun setPhotoFlash(mode: CaptureFlashMode) {
        imageCapture?.flashMode = when (mode) {
            CaptureFlashMode.ON -> ImageCapture.FLASH_MODE_ON
            CaptureFlashMode.AUTO -> ImageCapture.FLASH_MODE_AUTO
            CaptureFlashMode.OFF -> ImageCapture.FLASH_MODE_OFF
        }
    }

    override fun setZoom(displayed: Float) {
        camera?.cameraControl?.setZoomRatio(displayed.coerceIn(minZoom, maxZoom))
    }

    override fun focusAt(x: Float, y: Float): Boolean {
        val bound = camera ?: return false
        val point = previewView.meteringPointFactory.createPoint(x, y)
        val action = FocusMeteringAction.Builder(point).build()
        if (!bound.cameraInfo.isFocusMeteringSupported(action)) return false
        bound.cameraControl.startFocusAndMetering(action)
        return true
    }

    override fun release() {
        if (released) return
        released = true
        horizon.disable()
        recording?.stop()
        recording = null
        runCatching { camera?.cameraControl?.enableTorch(false) }
        runCatching { previewView.previewStreamState.removeObservers(lifecycleOwner) }
        session.setRunning(false, running)
        teardown()
    }

    private fun teardown() {
        provider?.unbindAll()
        camera = null
        imageCapture = null
        videoCapture = null
    }

    @Suppress("DEPRECATION")
    private fun displayRotation(): Int =
        (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay?.rotation ?: Surface.ROTATION_0

    @Composable
    override fun PreviewSurface(modifier: Modifier) {
        Box(modifier) {
            AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
            cover?.let {
                Image(
                    bitmap = it.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().blur(ComposerCameraSwitchRule.COVER_BLUR.dp),
                )
            }
        }
    }

    public companion object {
        private const val TAG = "CameraXCaptureEngine"

        @Volatile
        private var warm: ListenableFuture<ProcessCameraProvider>? = null

        /** Pré-chauffe le fournisseur de caméra à l'ouverture du composeur : la première trame du viseur arrive plus vite. */
        public fun prewarm(context: Context) {
            if (warm == null) warm = ProcessCameraProvider.getInstance(context.applicationContext)
        }
    }
}

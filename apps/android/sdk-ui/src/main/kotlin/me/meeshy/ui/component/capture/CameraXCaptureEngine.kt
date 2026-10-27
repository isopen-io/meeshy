package me.meeshy.ui.component.capture

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
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
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.util.concurrent.TimeUnit
import me.meeshy.sdk.model.composer.capture.CaptureFlashMode
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
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

    override fun bind(facing: CaptureLensFacing) {
        if (released) return
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (released) return@addListener
            runCatching { provider = future.get(); bindUseCases(facing) }
                .onFailure { sink(CaptureEngineSignal.BindFailed(it.message ?: "bind")) }
        }, mainExecutor)
    }

    private fun bindUseCases(facing: CaptureLensFacing) {
        val provider = provider ?: return
        val selector = if (facing == CaptureLensFacing.FRONT) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
        val photo = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(Quality.HD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
            .build()
        val video = VideoCapture.withOutput(recorder)
        provider.unbindAll()
        val bound = provider.bindToLifecycle(lifecycleOwner, selector, preview, photo, video)
        camera = bound
        imageCapture = photo
        videoCapture = video
        val zoom = bound.cameraInfo.zoomState.value
        minZoom = zoom?.minZoomRatio ?: 1f
        maxZoom = zoom?.maxZoomRatio ?: 1f
        sink(CaptureEngineSignal.Bound(facing, CaptureLensInfo(minZoom, maxZoom, bound.cameraInfo.hasFlashUnit())))
    }

    override fun takePhoto(token: String, file: File) {
        val capture = imageCapture ?: return sink(CaptureEngineSignal.PhotoFailed(token))
        val options = ImageCapture.OutputFileOptions.Builder(file).build()
        capture.takePicture(options, mainExecutor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(output: ImageCapture.OutputFileResults) = sink(CaptureEngineSignal.PhotoSaved(token, file))
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
        val cancelled = cancelRequested
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
        recording?.stop()
        recording = null
        runCatching { camera?.cameraControl?.enableTorch(false) }
        provider?.unbindAll()
        camera = null
        imageCapture = null
        videoCapture = null
    }

    @Composable
    override fun PreviewSurface(modifier: Modifier) {
        AndroidView(factory = { previewView }, modifier = modifier)
    }
}

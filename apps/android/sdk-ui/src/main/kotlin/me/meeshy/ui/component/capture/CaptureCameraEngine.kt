package me.meeshy.ui.component.capture

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import java.io.File
import me.meeshy.sdk.model.composer.capture.CaptureFlashMode
import me.meeshy.sdk.model.composer.capture.CaptureLensFacing
import me.meeshy.sdk.model.composer.capture.CaptureTorchMode

/** Ce que l'objectif lié sait faire : la plage de zoom (facteur appareil) et la présence d'un flash/d'une torche. */
public data class CaptureLensInfo(
    val minZoom: Float,
    val maxZoom: Float,
    val hasFlashUnit: Boolean,
)

/** Ce que la caméra remonte à l'hôte ; toujours sur le fil principal, jamais de travail lourd derrière. */
public sealed interface CaptureEngineSignal {
    data class Bound(val facing: CaptureLensFacing, val lens: CaptureLensInfo) : CaptureEngineSignal
    data class BindFailed(val reason: String) : CaptureEngineSignal
    data class PhotoSaved(val token: String, val file: File) : CaptureEngineSignal
    data class PhotoFailed(val token: String) : CaptureEngineSignal
    data class RecordingStarted(val token: String) : CaptureEngineSignal
    data class SegmentFinalized(val token: String, val file: File, val durationSec: Double) : CaptureEngineSignal
    data class SegmentFailed(val token: String) : CaptureEngineSignal
    data class SegmentCancelled(val token: String) : CaptureEngineSignal
}

/**
 * La couture entre la machine du viseur et la caméra. L'implémentation CameraX vit dans
 * [CameraXCaptureEngine] ; les témoins l'échangent contre un faux, parce que l'appareil photo n'existe pas en JVM.
 */
public interface CaptureCameraEngine {
    /** Lie les cas d'usage à l'objectif demandé ; [CaptureEngineSignal.Bound] quand le flux est prêt. */
    public fun bind(facing: CaptureLensFacing)

    public fun takePhoto(token: String, file: File)

    public fun startRecording(token: String, file: File)

    /** Referme la prise : le fichier du segment arrive par [CaptureEngineSignal.SegmentFinalized]. */
    public fun stopRecording()

    /** Le doigt s'est levé avant le départ : la prise est jetée, ni livrée ni perdue. */
    public fun cancelRecording()

    public fun setTorch(mode: CaptureTorchMode)

    public fun setPhotoFlash(mode: CaptureFlashMode)

    /** Facteur AFFICHÉ (1 = l'objectif d'ouverture) ; l'implémentation le convertit en facteur appareil. */
    public fun setZoom(displayed: Float)

    /** Vise le point de l'aperçu (pixels de la vue) ; `false` quand l'objectif ne règle rien. */
    public fun focusAt(x: Float, y: Float): Boolean

    /** Rend la caméra : détache tout, arrête la prise en cours. Idempotent. */
    public fun release()

    /** L'aperçu vivant. */
    @Composable
    public fun PreviewSurface(modifier: Modifier)
}
